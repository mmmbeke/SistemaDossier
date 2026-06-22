"""Listado y generación de dossiers persistidos en PostgreSQL (tabla `dossiers` del schema migrado)."""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from dossier.api.auth_routes import get_current_user_and_org, get_db_if_configured
from dossier.db.models import Dossier, Organization, User
from dossier.org_dossier_context import format_dossier_context_for_prompt
from dossier.graphs.corporate_dossier_graph import (
    JurisdictionScope,
    run_corporate_dossier_langgraph,
)
from dossier.schemas.dossier_generation import (
    DEPTH_CREDITS,
    CreateCorporateDossierRequest,
    build_corporate_generation_strings,
)
from dossier.schemas.person_research import PersonResearchRequest
from dossier.services.corporate_company_search import search_corporate_company_candidates
from dossier.gemini.analyze import normalize_person_report_text
from dossier.services.calendar_event_dossiers import _person_failure_message
from dossier.services.person_research_service import run_person_research
from dossier.services.calendar_event_dossiers import calendar_meeting_summary_from_dossier_data
from dossier.services.dossier_folder_utils import (
    build_dossier_list_entries,
    serialize_dossier_list_item,
    serialize_folder,
)

router = APIRouter(tags=["Dossiers"])


def _serialize_dossier_list_item(d: Dossier) -> dict:
    return serialize_dossier_list_item(d)


def _corporate_credit_charging_enabled() -> bool:
    """
    Cobro por generación corporativa (profundidad → créditos vía `DEPTH_CREDITS`).

    El descuento de saldo lo hace el trigger PostgreSQL `fn_debit_credits_on_dossier`
    (Migración) cuando `dossier_data->>'billing' != 'none'`. No duplicar descuento en Python.

    Desactivar cobro (p. ej. demos): `DOSSIER_CHARGE_CREDITS=0` en `.env`.
    """

    raw = os.getenv("DOSSIER_CHARGE_CREDITS", "true")
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _enterprise_effectively_unlimited(org: Organization) -> bool:
    """Plan Enterprise: sin bloqueo por saldo bajo (informe: créditos ilimitados)."""
    return (org.plan or "").strip().lower() == "enterprise"


# Ruta bajo `/dossiers/corporate/...` para no colisionar con `GET /dossiers/{dossier_id}` (un solo segmento).


@router.get("/dossiers/corporate/company-search")
def corporate_company_search(
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    q: str = Query(..., min_length=2, max_length=200),
):
    """Búsqueda UK (Companies House) + US (SEC tickers) para desambiguar nombres de empresa."""
    _user, _org = user_org
    return search_corporate_company_candidates(q)


@router.post("/dossiers/person/research")
def person_professional_research(
    body: PersonResearchRequest,
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    db: Session = Depends(get_db_if_configured),
):
    """
    Investigación de persona: por defecto **Lusha** (`research_source=lusha`).
    Alternativa: `gemini_web` (IA + Google Search). Requiere `LUSHA_API_KEY` para Lusha.

    Si se genera texto de informe, se persiste en `dossiers` (misma organización que el JWT),
    como los dossiers corporativos; la respuesta incluye `saved_dossier` con el `id` creado.
    """
    user, org = user_org
    t0 = time.perf_counter()
    try:
        result = run_person_research(
            body,
            organization_context_block=format_dossier_context_for_prompt(org),
        )
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    md = normalize_person_report_text((result.get("gemini_analysis_markdown") or "").strip())
    saved: dict | None = None
    now = datetime.now(timezone.utc)

    if md:
        is_err = md.lstrip().startswith("# Error")
        status = "failed" if is_err else "complete"
        dossier_id = uuid.uuid4()

        dossier_data_body: dict = {
            "format": "markdown",
            "body": md,
            "pipeline": "person_research",
            "success": not is_err,
            "billing": "none",
            "person_filters": {
                "full_name": body.full_name,
                "job_area": body.job_area,
                "company": body.company,
                "country": body.country,
                "city": body.city,
                "extra_keywords": body.extra_keywords,
                "research_source": body.research_source.value,
            },
        }

        dossier = Dossier(
            id=dossier_id,
            organization_id=org.id,
            requested_by_user_id=user.id,
            contact_id=None,
            subject_name=body.full_name.strip()[:255],
            subject_email=None,
            module_identity=True,
            module_corporate=False,
            module_media=False,
            depth_level="standard",
            credits_consumed=0,
            status=status,
            status_message="Error en el informe generado." if is_err else None,
            dossier_data=dossier_data_body,
            agents_activated=[],
            agents_failed=(["deepseek_person_analysis"] if is_err else []),
            data_sources_used=[],
            generation_started_at=now,
            generation_completed_at=now,
            generation_duration_ms=elapsed_ms,
            trigger_source="manual",
        )
        db.add(dossier)
        db.commit()
        db.refresh(dossier)

        saved = {
            "id": str(dossier.id),
            "organization_id": str(org.id),
            "status": dossier.status,
            "credits_consumed": dossier.credits_consumed,
            "generation_duration_ms": dossier.generation_duration_ms,
        }
    else:
        status_message = _person_failure_message(
            person_payload=result,
            errors=None,
            person_md=None,
        )
        dossier_id = uuid.uuid4()
        dossier = Dossier(
            id=dossier_id,
            organization_id=org.id,
            requested_by_user_id=user.id,
            contact_id=None,
            subject_name=body.full_name.strip()[:255],
            subject_email=None,
            module_identity=True,
            module_corporate=False,
            module_media=False,
            depth_level="standard",
            credits_consumed=0,
            status="failed",
            status_message=status_message,
            dossier_data={
                "format": "markdown",
                "body": "",
                "pipeline": "person_research",
                "success": False,
                "billing": "none",
                "person_filters": {
                    "full_name": body.full_name,
                    "job_area": body.job_area,
                    "company": body.company,
                    "country": body.country,
                    "city": body.city,
                    "extra_keywords": body.extra_keywords,
                    "research_source": body.research_source.value,
                },
            },
            agents_activated=[],
            agents_failed=(["deepseek_person_analysis"]),
            data_sources_used=[],
            generation_started_at=now,
            generation_completed_at=now,
            generation_duration_ms=elapsed_ms,
            trigger_source="manual",
        )
        db.add(dossier)
        db.commit()
        db.refresh(dossier)

        saved = {
            "id": str(dossier.id),
            "organization_id": str(org.id),
            "status": dossier.status,
            "status_message": dossier.status_message,
            "credits_consumed": dossier.credits_consumed,
            "generation_duration_ms": dossier.generation_duration_ms,
        }

    result["saved_dossier"] = saved
    return result


@router.post("/dossiers/corporate/generate")
def generate_corporate_dossier(
    body: CreateCorporateDossierRequest,
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    db: Session = Depends(get_db_if_configured),
):
    """
    Genera un dossier con el **agente corporativo** (LangGraph: UK + USA en paralelo,
    síntesis Gemini) y lo guarda en `dossiers`.

    Créditos (informe de producto): basic=1, standard=3, deep=5.
    El saldo se descuenta en PostgreSQL (trigger) salvo `billing: none` o cobro desactivado
    (`DOSSIER_CHARGE_CREDITS=0`). Si el pipeline devuelve error, no se cobra.
    """
    user, org = user_org
    charge = _corporate_credit_charging_enabled()
    cost = DEPTH_CREDITS[body.depth] if charge else 0

    db.refresh(org)
    if (
        charge
        and cost > 0
        and not _enterprise_effectively_unlimited(org)
        and org.credits_balance < cost
    ):
        raise HTTPException(
            status_code=402,
            detail=(
                f"Créditos insuficientes: se requieren {cost} y la organización tiene "
                f"{org.credits_balance}."
            ),
        )

    descripcion_parts: list[str] = []
    if body.subject_email:
        descripcion_parts.append(f"Email participante: {body.subject_email}")
    org_ctx = format_dossier_context_for_prompt(org)
    if org_ctx:
        descripcion_parts.append(org_ctx)
    descripcion = "\n".join(descripcion_parts)

    participantes, subject_display = build_corporate_generation_strings(body)

    explicit_scope: JurisdictionScope | None = None
    if body.resolution is not None:
        explicit_scope = (
            "uk_only" if body.resolution.source == "companies_house" else "us_only"
        )

    t0 = time.perf_counter()
    markdown = run_corporate_dossier_langgraph(
        tema_reunion=f"Dossier corporativo — {participantes[:200]}",
        participantes=participantes,
        descripcion=descripcion,
        jurisdiction_scope=explicit_scope,
    )
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    now = datetime.now(timezone.utc)

    is_err = markdown.lstrip().startswith("# Error")
    # Alineado con CHECK dossiers_status en Migración: complete | partial | failed | …
    status = "failed" if is_err else "complete"

    will_charge = charge and cost > 0 and not is_err

    dossier_id = uuid.uuid4()
    dossier_data_body: dict = {
        "format": "markdown",
        "body": markdown,
        "pipeline": "langgraph_corporate",
        "depth_requested": body.depth,
        "success": not is_err,
        # Trigger `fn_debit_credits_on_dossier`: solo cobra si billing != 'none' (p. ej. fallo → no cobro).
        "billing": "charged" if will_charge else "none",
    }
    if body.resolution is not None:
        dossier_data_body["resolution"] = body.resolution.model_dump(mode="json")

    dossier = Dossier(
        id=dossier_id,
        organization_id=org.id,
        requested_by_user_id=user.id,
        contact_id=None,
        subject_name=subject_display,
        subject_email=body.subject_email,
        module_identity=False,
        module_corporate=True,
        module_media=False,
        depth_level=body.depth,
        credits_consumed=cost if will_charge else 0,
        status=status,
        status_message="Error en síntesis o en el pipeline." if is_err else None,
        dossier_data=dossier_data_body,
        agents_activated=["agent_corporate_uk", "agent_corporate_usa", "synthesize_gemini"],
        agents_failed=(["synthesize_gemini"] if is_err else []),
        data_sources_used=["companies_house", "sec_edgar", "sec_company_facts", "gemini"],
        generation_started_at=now,
        generation_completed_at=now,
        generation_duration_ms=elapsed_ms,
        trigger_source="manual",
    )

    db.add(dossier)
    db.commit()
    db.refresh(dossier)
    db.refresh(org)

    return {
        "id": str(dossier.id),
        "organization_id": str(org.id),
        "status": dossier.status,
        "credits_consumed": dossier.credits_consumed,
        "organization_credits_balance": org.credits_balance,
        "generation_duration_ms": dossier.generation_duration_ms,
    }


@router.get("/dossiers/folders/{folder_id}")
def get_dossier_folder(
    folder_id: UUID,
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    db: Session = Depends(get_db_if_configured),
):
    """Carpeta con los dossiers (empresa + persona) de un mismo evento de calendario."""
    _user, org = user_org
    rows = db.execute(
        select(Dossier)
        .where(
            Dossier.organization_id == org.id,
            Dossier.dossier_folder_id == folder_id,
        )
        .order_by(Dossier.created_at.asc())
    ).scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")
    return serialize_folder(rows)


@router.get("/dossiers/{dossier_id}")
def get_dossier_by_id(
    dossier_id: UUID,
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    db: Session = Depends(get_db_if_configured),
):
    """Devuelve un dossier si pertenece a la organización del JWT."""
    _user, org = user_org
    d = db.get(Dossier, dossier_id)
    if d is None or d.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Dossier no encontrado.")
    return {
        "id": str(d.id),
        "organization_id": str(d.organization_id),
        "subject_name": d.subject_name,
        "subject_email": d.subject_email,
        "status": d.status,
        "depth_level": d.depth_level,
        "credits_consumed": d.credits_consumed,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        "dossier_data": d.dossier_data,
        "alerts": d.alerts,
        "agents_activated": list(d.agents_activated or []),
        "agents_failed": list(d.agents_failed or []),
        "data_sources_used": list(d.data_sources_used or []),
        "generation_duration_ms": d.generation_duration_ms,
        "status_message": d.status_message,
        "trigger_source": d.trigger_source,
        "calendar_meeting": calendar_meeting_summary_from_dossier_data(
            d.dossier_data if isinstance(d.dossier_data, dict) else None,
            trigger_source=d.trigger_source,
        ),
    }


@router.delete("/dossiers/{dossier_id}", status_code=204)
def delete_dossier_by_id(
    dossier_id: UUID,
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    db: Session = Depends(get_db_if_configured),
):
    """Elimina un dossier de la organización del JWT (filas hijas con ON DELETE CASCADE en BD)."""
    _user, org = user_org
    d = db.get(Dossier, dossier_id)
    if d is None or d.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Dossier no encontrado.")
    db.delete(d)
    db.commit()
    return Response(status_code=204)


@router.get("/dossiers")
def list_dossiers_for_org(
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    db: Session = Depends(get_db_if_configured),
    limit: int = Query(50, ge=1, le=100),
):
    """
    Lista dossiers de la organización activa (`org_id` en el JWT).

    Requiere haber ejecutado el SQL de migración (tabla `dossiers` y dependencias).
    """
    _user, org = user_org
    stmt = (
        select(Dossier)
        .where(Dossier.organization_id == org.id)
        .order_by(Dossier.created_at.desc())
        .limit(limit)
    )
    rows = db.execute(stmt).scalars().all()
    return {
        "organization_id": str(org.id),
        "items": build_dossier_list_entries(rows),
    }
