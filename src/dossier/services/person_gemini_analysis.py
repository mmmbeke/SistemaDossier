"""Análisis narrativo (Gemini) a partir de datos de perfiles públicos."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from dossier.llm.text_generate import generate_text_with_llm
from dossier.services.person_analysis_prompts import (
    format_meeting_context_block,
    person_dossier_system_prompt,
)
from dossier.services.lusha_profile_facts import format_lusha_verified_facts_block


def _truncate_json(payload: Any, max_chars: int) -> str:
    raw = json.dumps(payload, ensure_ascii=False, indent=2)
    if len(raw) <= max_chars:
        return raw
    return raw[: max_chars - 80] + "\n\n… [entrada truncada por tamaño] …\n"


def _header_line(filters: dict[str, Any]) -> str:
    name = str(filters.get("full_name") or "").strip() or "No indicado"
    company = str(filters.get("company") or "").strip() or "No indicada"
    country = str(filters.get("country") or "").strip() or "No indicado"
    city = str(filters.get("city") or "").strip()
    if city:
        country = f"{country} — {city}" if country != "No indicado" else city
    return f"{name} / {company} / {country}"


def _build_user_prompt(
    *,
    filters: dict[str, Any],
    bundle_json: str,
    meeting_context: dict[str, Any] | None = None,
    lusha_verified_facts: dict[str, Any] | None = None,
    enrichment_provider: str = "lusha",
) -> str:
    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    cabecera = _header_line(filters)
    reunion_block = format_meeting_context_block(meeting_context)
    verified_block = format_lusha_verified_facts_block(
        lusha_verified_facts or {},
        provider=enrichment_provider,
    )
    src = enrichment_provider.upper()

    return f"""Persona objeto del encargo: {cabecera}
Fecha del análisis: {fecha}

{reunion_block}{verified_block}Elabora el dossier siguiendo **exactamente** las 8 secciones del sistema (Ficha de identidad → Fuentes y nivel de confianza).
Incluye la tabla de análisis de riesgo de la sección 5.
Completa la sección 6 si hay empresa indicada en el encargo o en el contexto de reunión.

**Prioridad de fuentes:** 1) bloque «DATOS VERIFICADOS {src}» arriba; 2) JSON ``perfiles``; 3) encargo manual.
Si LinkedIn, email o teléfono aparecen en ese bloque, **debes** incluirlos en la sección 1 (nunca «No disponible»).

Usa el siguiente JSON como corpus de hechos (datos {src} y contexto):

{bundle_json}
"""


def analyze_person_profile_bundle(
    *,
    filters: dict[str, Any],
    profiles: list[dict[str, Any]],
    posts_by_url: dict[str, Any],
    meeting_context: dict[str, Any] | None = None,
    lusha_verified_facts: dict[str, Any] | None = None,
    enrichment_provider: str = "lusha",
    output_language: str = "es",
) -> str:
    max_chars = int(os.getenv("DEEPSEEK_PERSON_MAX_JSON_CHARS", os.getenv("GEMINI_PERSON_MAX_JSON_CHARS", "120000")))
    bundle: dict[str, Any] = {
        "criterios_de_busqueda": filters,
        "perfiles": profiles,
        "publicaciones_por_url": posts_by_url or {},
    }
    if meeting_context:
        bundle["contexto_reunion"] = meeting_context
    bundle_json = _truncate_json(bundle, max_chars)
    user_prompt = _build_user_prompt(
        filters=filters,
        bundle_json=bundle_json,
        meeting_context=meeting_context,
        lusha_verified_facts=lusha_verified_facts,
        enrichment_provider=enrichment_provider,
    )
    return generate_text_with_llm(
        user_prompt,
        system_instruction=person_dossier_system_prompt(
            meeting_context=meeting_context,
            output_language=output_language,
        ),
    )
