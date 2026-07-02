"""Pipeline de investigación de persona con persistencia en PostgreSQL."""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from dossier.cache.corporate_dossier_redis import cached_until_from_now
from dossier.cache.person_dossier_redis import (
    get_person_cached_payload,
    person_cache_redis_key,
    redis_person_cache_available,
    run_with_person_cache_lock,
    set_person_cached_payload,
)
from dossier.db.models import Dossier, Organization, User
from dossier.gemini.analyze import normalize_person_report_text
from dossier.org_dossier_context import format_dossier_context_for_prompt
from dossier.schemas.person_research import PersonResearchRequest
from dossier.services.calendar_event_dossiers import _person_failure_message
from dossier.services.output_language import effective_output_language, normalize_output_language
from dossier.services.person_dossier_dedup import (
    person_research_fingerprint,
    person_research_response_from_redis_cache,
)
from dossier.services.person_research_service import run_person_research

logger = logging.getLogger(__name__)


def run_person_research_and_persist(
    db: Session,
    *,
    user: User,
    org: Organization,
    body: PersonResearchRequest,
) -> dict[str, Any]:
    """
    Ejecuta investigación de persona, persiste en ``dossiers`` y devuelve la respuesta API.
    """
    org_ctx = format_dossier_context_for_prompt(org)
    out_lang = effective_output_language(user, body.output_language)
    fp = person_research_fingerprint(body, org.id, output_language=out_lang)
    skip_cache = bool(body.force_refresh)

    cache_hit = False
    cached_payload: dict[str, Any] | None = None
    if redis_person_cache_available() and not skip_cache:
        hit = get_person_cached_payload(fp)
        if hit is not None:
            cached_payload = hit
            cache_hit = True

    result: dict[str, Any] | None = None
    elapsed_ms = 0
    research_error: str | None = None

    if not cache_hit:

        def _compute() -> None:
            nonlocal cache_hit, cached_payload, result, elapsed_ms, research_error
            if not skip_cache:
                h2 = get_person_cached_payload(fp)
                if h2 is not None:
                    cached_payload = h2
                    cache_hit = True
                    return
            t_run = time.perf_counter()
            try:
                nr = run_person_research(
                    body,
                    organization_context_block=org_ctx,
                    output_language=out_lang,
                )
            except ValueError as e:
                research_error = str(e)
                return
            result = nr
            elapsed_ms = int((time.perf_counter() - t_run) * 1000)
            md_new = (result.get("gemini_analysis_markdown") or "").strip()
            if md_new and not md_new.lstrip().startswith("# Error"):
                set_person_cached_payload(
                    fp,
                    {
                        "markdown": md_new,
                        "gemini_google_search_used": result.get("gemini_google_search_used"),
                    },
                )
            cache_hit = False

        run_with_person_cache_lock(fp, _compute)
        if research_error is not None:
            raise ValueError(research_error)
    else:
        elapsed_ms = 0

    if cache_hit and cached_payload is not None:
        result = person_research_response_from_redis_cache(
            body,
            organization_context_block=org_ctx,
            markdown=str(cached_payload.get("markdown") or ""),
            gemini_google_search_used=cached_payload.get("gemini_google_search_used"),
        )
        elapsed_ms = 0

    if result is None:
        raise RuntimeError(
            "Respuesta de investigación vacía; revisa logs del servidor."
        )

    logger.info(
        "person_research pipeline cache=%s redis=%s force_refresh=%s key_prefix=%s",
        "hit" if cache_hit else "miss",
        redis_person_cache_available(),
        skip_cache,
        fp[:16],
    )

    md = normalize_person_report_text((result.get("gemini_analysis_markdown") or "").strip())
    saved: dict[str, Any] | None = None
    now = datetime.now(timezone.utc)
    cache_row_key = person_cache_redis_key(fp) if cache_hit else None
    cache_expires = cached_until_from_now() if cache_hit else None

    if md:
        is_err = md.lstrip().startswith("# Error")
        status = "failed" if is_err else "complete"
        dossier_id = uuid.uuid4()

        dossier_data_body: dict[str, Any] = {
            "format": "markdown",
            "body": md,
            "pipeline": "person_research",
            "success": not is_err,
            "billing": "none",
            "person_dedup_key": fp,
            "gemini_google_search_used": result.get("gemini_google_search_used"),
            "cache": {
                "hit": cache_hit,
                "redis": redis_person_cache_available(),
            },
            "person_filters": {
                "full_name": body.full_name,
                "job_area": body.job_area,
                "company": body.company,
                "country": body.country,
                "city": body.city,
                "extra_keywords": body.extra_keywords,
                "research_source": body.research_source.value,
            },
            "output_language": out_lang,
        }

        dossier = Dossier(
            id=dossier_id,
            organization_id=org.id,
            requested_by_user_id=user.id,
            contact_id=None,
            subject_name=body.full_name.strip()[:255],
            subject_email=(body.email or "")[:255] or None,
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
            cache_key=cache_row_key,
            cached_until=cache_expires,
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
            subject_email=(body.email or "")[:255] or None,
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
                "person_dedup_key": fp,
                "cache": {
                    "hit": cache_hit,
                    "redis": redis_person_cache_available(),
                },
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
    result["dossier_source"] = "generated" if skip_cache else ("redis_cache" if cache_hit else "generated")
    result["force_refresh"] = skip_cache
    return result
