"""
Huella estable para caché Redis de investigación de persona.

Estrategia: reutilizar por **nombre de persona dentro de la organización** (ignora cargo,
empresa, país, keywords, email, etc.). El nombre se normaliza quitando tildes/acentos y
mayúsculas, de modo que «Víctor», «Victor» o «VÍCTOR» comparten la misma caché.

Incluye ``organization_id`` porque el pipeline inyecta contexto de organización en el análisis;
sin eso, dos organizaciones con un mismo nombre compartirían informe (fuga de contexto).

Para invalidar manualmente toda la caché de persona: sube ``DOSSIER_PERSON_CACHE_VERSION`` en ``.env``.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import unicodedata
import uuid
from typing import Any

from dossier.schemas.person_research import PersonResearchRequest
from dossier.services.output_language import normalize_output_language
from dossier.services.person_research_service import _merge_geo


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


def _norm_name(s: str | None) -> str:
    """Nombre normalizado: sin acentos, sin mayúsculas, espacios colapsados."""
    if s is None:
        return ""
    t = _strip_accents(str(s)).strip()
    return re.sub(r"\s+", " ", t).casefold()


def _normalized_output_language(req: PersonResearchRequest, explicit: str | None) -> str:
    return normalize_output_language(explicit or req.output_language)


def person_research_fingerprint(
    req: PersonResearchRequest,
    organization_id: uuid.UUID,
    *,
    output_language: str | None = None,
) -> str:
    """
    Hash SHA-256 (hex) para clave Redis ``dossier:person:payload:{hash}``.

    Solo depende de (nombre normalizado + organización + idioma de salida + versión de caché):
    la misma persona se reutiliza aunque cambien cargo, empresa, país o palabras clave.
    """
    payload: dict[str, Any] = {
        "full_name": _norm_name(req.full_name),
        "organization_id": str(organization_id),
        "output_language": _normalized_output_language(req, output_language),
        "person_cache_version": (os.getenv("DOSSIER_PERSON_CACHE_VERSION") or "1").strip(),
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def person_research_response_from_redis_cache(
    req: PersonResearchRequest,
    *,
    organization_context_block: str | None,
    markdown: str,
    gemini_google_search_used: bool | None,
) -> dict[str, Any]:
    """Forma compatible con ``run_person_research`` para hits de Redis."""
    return {
        "filters_applied": {
            "full_name": req.full_name,
            "job_area": req.job_area,
            "company": req.company,
            "country": req.country,
            "city": req.city,
            "email": req.email,
            "linkedin_url": req.linkedin_url,
            "extra_keywords": req.extra_keywords,
            "contexto_organizacion_cliente": (organization_context_block or "").strip() or None,
            "geo_effective": _merge_geo(req.country, req.city),
            "start": req.start,
            "max_profiles": req.max_profiles,
            "include_posts": req.include_posts,
            "research_source": req.research_source.value,
            "research_mode": "redis_cache",
        },
        "search_attempts": [],
        "profile_urls": [],
        "profiles": [],
        "posts_by_url": {},
        "gemini_analysis_markdown": markdown.strip() or None,
        "gemini_google_search_used": gemini_google_search_used,
        "warnings": [],
    }
