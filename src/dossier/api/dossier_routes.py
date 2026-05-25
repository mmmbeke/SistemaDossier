"""Listado y generación de dossiers persistidos en PostgreSQL (tabla `dossiers` del schema migrado)."""
from __future__ import annotations

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
from dossier.services.person_research_service import run_person_research

router = APIRouter(tags=["Dossiers"])

# Temporal: sin comprobación de saldo ni descuento al generar dossiers corporativos.
# Pon en True cuando quieras volver a cobrar según `DEPTH_CREDITS`.
_CHARGE_CREDITS_FOR_CORPORATE_DOSSIER = False


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
):
    """
    Búsqueda de persona vía Netrows (`/people/search` + `/people/profile`) y análisis
    narrativo con Gemini a partir del JSON devuelto. Requiere `NETROWS_API_KEY` y, para
    el informe de IA, `GEMINI_API_KEY` (o `GOOGLE_API_KEY`).
    """
    _user, _org = user_org
    try:
        return run_person_research(body)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.post("/dossiers/corporate/generate")
def generate_corporate_dossier(
    body: CreateCorporateDossierRequest,
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    db: Session = Depends(get_db_if_configured),
):
    """
    Genera un dossier con el **agente corporativo** (LangGraph: UK + USA en paralelo,
    síntesis Gemini) y lo guarda en `dossiers`.

    El cobro de créditos está gobernado por `_CHARGE_CREDITS_FOR_CORPORATE_DOSSIER`
    (por defecto desactivado).
    """
    user, org = user_org
    cost = DEPTH_CREDITS[body.depth] if _CHARGE_CREDITS_FOR_CORPORATE_DOSSIER else 0

    if _CHARGE_CREDITS_FOR_CORPORATE_DOSSIER and org.credits_balance < cost:
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

    dossier_id = uuid.uuid4()
    dossier_data_body: dict = {
            "format": "markdown",
            "body": markdown,
            "pipeline": "langgraph_corporate",
            "depth_requested": body.depth,
            "success": not is_err,
            # Consumido por el trigger `fn_debit_credits_on_dossier` (Migración): sin débito si es "none".
            "billing": "none" if cost == 0 else "charged",
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
        credits_consumed=cost,
        status=status,
        status_message="Error en síntesis o en el pipeline." if is_err else None,
        dossier_data=dossier_data_body,
        agents_activated=["agent_corporate_uk", "agent_corporate_usa", "synthesize_gemini"],
        agents_failed=(["synthesize_gemini"] if is_err else []),
        data_sources_used=["companies_house", "sec_edgar", "gemini"],
        generation_started_at=now,
        generation_completed_at=now,
        generation_duration_ms=elapsed_ms,
        trigger_source="manual",
    )

    if _CHARGE_CREDITS_FOR_CORPORATE_DOSSIER and cost > 0:
        org.credits_balance = org.credits_balance - cost
        db.add(org)

    db.add(dossier)
    db.commit()
    db.refresh(dossier)
    if _CHARGE_CREDITS_FOR_CORPORATE_DOSSIER and cost > 0:
        db.refresh(org)

    return {
        "id": str(dossier.id),
        "organization_id": str(org.id),
        "status": dossier.status,
        "credits_consumed": dossier.credits_consumed,
        "organization_credits_balance": org.credits_balance,
        "generation_duration_ms": dossier.generation_duration_ms,
    }


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
        "items": [
            {
                "id": str(r.id),
                "subject_name": r.subject_name,
                "subject_email": r.subject_email,
                "status": r.status,
                "depth_level": r.depth_level,
                "credits_consumed": r.credits_consumed,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                "dossier_data": r.dossier_data,
            }
            for r in rows
        ],
    }
