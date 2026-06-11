"""Análisis narrativo (Gemini) a partir de datos de perfiles públicos — informe exhaustivo."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from dossier.gemini.text_generate import generate_text_with_gemini
from dossier.services.person_analysis_prompts import PERSON_EXHAUSTIVE_SYSTEM_PROMPT


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


def _build_user_prompt(*, filters: dict[str, Any], bundle_json: str) -> str:
    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    cabecera = _header_line(filters)

    return f"""Persona objeto del encargo: {cabecera}
Fecha del análisis: {fecha}

Elabora un informe **exhaustivo** siguiendo la estructura del sistema. Cruza perfiles y publicaciones; busca
inconsistencias en puestos y proyectos; destaca publicaciones o situaciones que llamen la atención; cierra con
recomendaciones y valoración sobre relacionarse o hacer tratos.

Usa exclusivamente el siguiente JSON como corpus de hechos:

{bundle_json}
"""


def analyze_person_profile_bundle(
    *,
    filters: dict[str, Any],
    profiles: list[dict[str, Any]],
    posts_by_url: dict[str, Any],
) -> str:
    max_chars = int(os.getenv("GEMINI_PERSON_MAX_JSON_CHARS", "120000"))
    bundle: dict[str, Any] = {
        "criterios_de_busqueda": filters,
        "perfiles": profiles,
        "publicaciones_por_url": posts_by_url or {},
    }
    bundle_json = _truncate_json(bundle, max_chars)
    user_prompt = _build_user_prompt(filters=filters, bundle_json=bundle_json)
    return generate_text_with_gemini(
        user_prompt,
        system_instruction=PERSON_EXHAUSTIVE_SYSTEM_PROMPT,
    )
