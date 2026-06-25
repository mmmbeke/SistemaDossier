"""
Automatización de calendario: sincroniza reuniones próximas y genera dossiers
unos minutos antes del inicio (por defecto 20 min), sin intervención manual.
"""
from __future__ import annotations

import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from dossier.db.models import CalendarEvent, CalendarIntegration, Dossier, Organization, User
from dossier.org_dossier_context import format_dossier_context_for_prompt
from dossier.services.calendar_event_dossiers import (
    generate_dossiers_from_calendar_event,
    persist_calendar_dossiers,
)
from dossier.services.output_language import resolve_output_language_from_user_locale
from dossier.services.google_calendar_api import (
    listar_reuniones_google,
    obtener_reunion_google_por_id,
)
from dossier.services.google_calendar_token import get_google_calendar_access_token_for_user
from dossier.services.graph_calendar import (
    coerce_reunion_payload,
    listar_reuniones,
    obtener_reunion_por_id,
)
from dossier.services.microsoft_calendar_token import get_microsoft_graph_access_token_for_user

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.\w+")


def automation_enabled() -> bool:
    raw = os.getenv("CALENDAR_AUTOMATION_ENABLED", "1").strip().lower()
    return raw in ("1", "true", "yes", "on")


def poll_interval_seconds() -> int:
    raw = os.getenv("CALENDAR_AUTOMATION_POLL_SECONDS", "60").strip()
    try:
        return max(15, int(raw))
    except ValueError:
        return 60


def default_advance_minutes() -> int:
    """Minutos antes del evento para generar dossiers (por defecto 20)."""
    raw = os.getenv("CALENDAR_DEFAULT_ADVANCE_MINUTES", "20").strip()
    try:
        return max(1, min(int(raw), 7 * 24 * 60))
    except ValueError:
        return 20


def effective_advance_minutes(integration: CalendarIntegration) -> int:
    env = os.getenv("CALENDAR_DEFAULT_ADVANCE_MINUTES", "").strip()
    if env.isdigit():
        return max(1, min(int(env), 7 * 24 * 60))
    allowed = {15, 20, 30, 60, 1440}
    adv = integration.advance_minutes or 20
    return adv if adv in allowed else 20


def parse_event_datetime(value: str | None) -> datetime | None:
    if not value or not str(value).strip():
        return None
    s = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _attendees_from_participantes(participantes: str) -> list[dict[str, str]]:
    emails = _EMAIL_RE.findall(participantes or "")
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for em in emails:
        low = em.lower()
        if low in seen:
            continue
        seen.add(low)
        domain = low.split("@")[-1] if "@" in low else ""
        out.append({"email": em, "domain": domain})
    return out


def _list_upcoming_reuniones(integration: CalendarIntegration, db: Session) -> list[dict[str, Any]]:
    token: str
    if integration.provider == "google":
        token = get_google_calendar_access_token_for_user(db, integration.user_id)
        return listar_reuniones_google(token, top=40, dias_adelante=3, incluir_pasadas=False)
    if integration.provider == "microsoft":
        token = get_microsoft_graph_access_token_for_user(db, integration.user_id)
        return listar_reuniones(token, top=40, dias_adelante=3, incluir_pasadas=False)
    return []


def _fetch_reunion(
    integration: CalendarIntegration,
    db: Session,
    external_event_id: str,
) -> dict[str, Any] | None:
    if integration.provider == "google":
        token = get_google_calendar_access_token_for_user(db, integration.user_id)
        return obtener_reunion_google_por_id(token, external_event_id)
    if integration.provider == "microsoft":
        token = get_microsoft_graph_access_token_for_user(db, integration.user_id)
        return obtener_reunion_por_id(token, external_event_id)
    return None


def _reunion_for_processing(
    integration: CalendarIntegration,
    db: Session,
    event: CalendarEvent,
) -> dict[str, Any] | None:
    """Usa snapshot guardado en sync; si falta, pide el evento al proveedor."""
    snap = event.event_snapshot
    if isinstance(snap, dict):
        coerced = coerce_reunion_payload(snap)
        if coerced:
            return coerced
    return _fetch_reunion(integration, db, event.external_event_id)


def reschedule_user_calendar_events(
    db: Session,
    user_id: UUID,
    advance_minutes: int,
) -> int:
    """Recalcula ``dossier_scheduled_at`` para reuniones futuras aún no procesadas."""
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(CalendarEvent).where(
            CalendarEvent.user_id == user_id,
            CalendarEvent.processing_status == "scheduled",
            CalendarEvent.starts_at > now,
        )
    ).scalars().all()
    for row in rows:
        row.dossier_scheduled_at = row.starts_at - timedelta(minutes=advance_minutes)
    if rows:
        db.commit()
    return len(rows)


def sync_calendar_events_for_integration(db: Session, integration: CalendarIntegration) -> int:
    """Importa/actualiza eventos futuros en ``calendar_events``. Devuelve cuántos se tocaron."""
    if not integration.is_enabled or integration.revoked_at is not None:
        return 0

    try:
        reuniones = _list_upcoming_reuniones(integration, db)
    except Exception as e:
        logger.warning(
            "Sync calendario falló user=%s provider=%s: %s",
            integration.user_id,
            integration.provider,
            e,
        )
        return 0

    advance = effective_advance_minutes(integration)
    now = datetime.now(timezone.utc)
    touched = 0

    for reunion in reuniones:
        ext_id = (reunion.get("id") or "").strip()
        if not ext_id:
            continue
        starts = parse_event_datetime(reunion.get("inicio"))
        if starts is None or starts <= now:
            continue

        ends = parse_event_datetime(reunion.get("fin"))
        scheduled_at = starts - timedelta(minutes=advance)

        row = db.execute(
            select(CalendarEvent).where(
                CalendarEvent.calendar_integration_id == integration.id,
                CalendarEvent.external_event_id == ext_id,
            )
        ).scalar_one_or_none()

        if row is not None and row.processing_status in ("completed", "processing"):
            row.title = (reunion.get("tema") or row.title or "")[:500]
            row.starts_at = starts
            row.ends_at = ends
            row.external_attendees = _attendees_from_participantes(reunion.get("participantes") or "")
            row.event_snapshot = reunion
            touched += 1
            continue

        if row is None:
            row = CalendarEvent(
                calendar_integration_id=integration.id,
                organization_id=integration.organization_id,
                user_id=integration.user_id,
                external_event_id=ext_id,
                processing_status="scheduled",
            )
            db.add(row)

        row.title = (reunion.get("tema") or "")[:500]
        row.starts_at = starts
        row.ends_at = ends
        row.meeting_url = (reunion.get("ubicacion") or None)
        row.external_attendees = _attendees_from_participantes(reunion.get("participantes") or "")
        row.event_snapshot = reunion
        row.dossier_scheduled_at = scheduled_at
        row.processing_status = "scheduled"
        row.skip_reason = None
        touched += 1

    db.commit()
    return touched


def _mark_past_unprocessed_skipped(db: Session) -> int:
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(CalendarEvent).where(
            CalendarEvent.processing_status.in_(("scheduled", "detected")),
            CalendarEvent.starts_at <= now,
        )
    ).scalars().all()
    for row in rows:
        row.processing_status = "skipped"
        row.skip_reason = "La reunión ya comenzó antes de generar el dossier."
    if rows:
        db.commit()
    return len(rows)


def _generation_skip_reason(result: dict[str, Any]) -> str:
    errors = result.get("errors") or []
    if errors:
        return "; ".join(str(e) for e in errors)[:500]

    parsed = result.get("parse") or {}
    if not (parsed.get("company_corporate") or parsed.get("person_name")):
        return (
            "No se detectó empresa ni contacto. Usa «Empresa: …» y «Contacto: …» en la descripción."
        )

    for key, label in (
        ("dossier_corporativo", "corporativo"),
        ("dossier_persona", "persona"),
    ):
        md = (result.get(key) or "").lstrip()
        if md.startswith("# Error"):
            return f"Error al generar dossier {label}."
        if md.startswith("No se pudo generar ningún dossier"):
            return "Formato del evento incompleto para generar dossiers."

    return "La generación terminó pero no hubo informe válido para guardar."


def _requeue_completed_without_dossiers(db: Session) -> int:
    """Reprograma eventos marcados completed sin filas en ``dossiers`` (reintentos)."""
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(CalendarEvent).where(
            CalendarEvent.processing_status == "completed",
            CalendarEvent.starts_at > now,
            ~exists(
                select(Dossier.id).where(Dossier.calendar_event_id == CalendarEvent.id)
            ),
        )
    ).scalars().all()
    for row in rows:
        row.processing_status = "scheduled"
        row.skip_reason = None
        row.dossier_scheduled_at = now
    if rows:
        db.commit()
        logger.info("Automatización: %s evento(s) reprogramados (completed sin dossier)", len(rows))
    return len(rows)


def process_due_calendar_events(db: Session) -> dict[str, int]:
    """Genera dossiers para eventos cuya ventana de anticipación ya venció."""
    now = datetime.now(timezone.utc)
    stats = {"processed": 0, "failed": 0, "skipped": 0, "requeued": 0}

    stats["requeued"] = _requeue_completed_without_dossiers(db)

    due = db.execute(
        select(CalendarEvent, CalendarIntegration)
        .join(
            CalendarIntegration,
            CalendarEvent.calendar_integration_id == CalendarIntegration.id,
        )
        .where(
            CalendarEvent.processing_status == "scheduled",
            CalendarEvent.dossier_scheduled_at.is_not(None),
            CalendarEvent.dossier_scheduled_at <= now,
            CalendarEvent.starts_at > now,
            CalendarIntegration.is_enabled.is_(True),
            CalendarIntegration.revoked_at.is_(None),
        )
        .order_by(CalendarEvent.dossier_scheduled_at.asc())
        .limit(5)
    ).all()

    stats["due"] = len(due)

    for event, integration in due:
        event.processing_status = "processing"
        db.commit()

        reunion = _reunion_for_processing(integration, db, event)
        if not reunion:
            event.processing_status = "failed"
            event.skip_reason = "No se pudo leer el evento en el calendario."
            stats["failed"] += 1
            db.commit()
            continue

        org = db.get(Organization, event.organization_id)
        org_ctx = format_dossier_context_for_prompt(org) if org else ""
        user = db.get(User, event.user_id)
        out_lang = resolve_output_language_from_user_locale(user.locale if user else None)

        t0 = time.perf_counter()
        try:
            result = generate_dossiers_from_calendar_event(
                reunion,
                organization_context_block=org_ctx or None,
                organization_id=event.organization_id,
                output_language=out_lang,
            )
            elapsed_ms = int((time.perf_counter() - t0) * 1000)
            persist_calendar_dossiers(
                db,
                user_id=event.user_id,
                org_id=event.organization_id,
                result=result,
                calendar_provider=integration.provider,
                generation_duration_ms=elapsed_ms,
                calendar_event_id=event.id,
            )
            saved = result.get("saved_dossiers") or {}
            if saved:
                event.processing_status = "completed"
                event.skip_reason = None
                stats["processed"] += 1
            else:
                event.processing_status = "failed"
                event.skip_reason = _generation_skip_reason(result)
                stats["failed"] += 1
                logger.warning(
                    "Automatización: event=%s sin dossier guardado: %s",
                    event.id,
                    event.skip_reason,
                )
        except Exception as e:
            logger.exception("Automatización: fallo dossier event=%s", event.id)
            event.processing_status = "failed"
            event.skip_reason = str(e)[:500]
            stats["failed"] += 1

        db.commit()

    stats["skipped"] = _mark_past_unprocessed_skipped(db)
    return stats


def run_calendar_automation_tick(db: Session) -> dict[str, Any]:
    """Un ciclo: sincronizar integraciones activas y procesar eventos pendientes."""
    integrations = db.execute(
        select(CalendarIntegration).where(
            CalendarIntegration.is_enabled.is_(True),
            CalendarIntegration.revoked_at.is_(None),
        )
    ).scalars().all()

    synced = 0
    for integration in integrations:
        synced += sync_calendar_events_for_integration(db, integration)

    stats = process_due_calendar_events(db)
    return {
        "integrations": len(integrations),
        "events_synced": synced,
        **stats,
        "advance_minutes": default_advance_minutes(),
    }
