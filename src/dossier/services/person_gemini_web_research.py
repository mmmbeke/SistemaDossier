"""
Informe de persona con DeepSeek (sin búsqueda web en vivo).

Cuando Lusha no devuelve perfiles o no está disponible, el modelo redacta
el informe a partir del encargo, contexto de reunión y conocimiento público
del modelo (sin grounding Google Search).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from dossier.config import load_env
from dossier.llm.client import chat_completion, deepseek_api_key, deepseek_model
from dossier.services.person_analysis_prompts import (
    format_meeting_context_block,
    person_dossier_system_prompt,
)


def _fv(filters: dict[str, Any], key: str, default: str = "No indicado") -> str:
    v = filters.get(key)
    if v is None:
        return default
    s = str(v).strip()
    return s if s else default


def _geo_line(filters: dict[str, Any]) -> str:
    country = (filters.get("country") or "").strip()
    city = (filters.get("city") or "").strip()
    if not country and not city:
        return "No indicado"
    if city and country:
        return f"{city}, {country}"
    return city or country


def _name_title_case_words(name: str) -> str:
    return " ".join((w[:1].upper() + w[1:].lower()) if w else "" for w in name.split())


def _context_line(filters: dict[str, Any]) -> str:
    parts: list[str] = []
    org = _fv(filters, "contexto_organizacion_cliente", "")
    if org != "No indicado":
        parts.append(f"Contexto organización/cliente: {org}")
    extra = _fv(filters, "extra_keywords", "")
    if extra != "No indicado":
        parts.append(f"Palabras clave / motivo de investigación: {extra}")
    if not parts:
        return "No indicado"
    return " | ".join(parts)


def _build_user_prompt(
    filters: dict[str, Any],
    meeting_context: dict[str, Any] | None = None,
) -> str:
    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    nombre = _fv(filters, "full_name")
    nombre_fmt = _name_title_case_words(nombre)
    empresa = _fv(filters, "company")
    cargo = _fv(filters, "job_area")
    geo = _geo_line(filters)
    ctx = _context_line(filters)
    reunion_block = format_meeting_context_block(meeting_context)

    return f"""Datos del encargo (fecha: {fecha}):

- Nombre: {nombre} (variante sugerida: {nombre_fmt})
- Contexto: {ctx}
- País/ciudad: {geo}
- Empresa: {empresa}
- Cargo/área: {cargo}

{reunion_block}---

## Instrucciones

Redacta el dossier ejecutivo en el formato **exacto** del sistema (8 secciones con encabezados ###).
Desambigua homónimos usando empresa, cargo y ubicación indicados.
Completa todas las secciones; donde falte evidencia escribe "No disponible" o "Sin evidencia disponible".
No incluyas listas de búsquedas ni metadatos técnicos del pipeline."""


def analyze_person_with_google_search(
    *,
    filters: dict[str, Any],
    meeting_context: dict[str, Any] | None = None,
    model: str | None = None,
    max_retries: int = 3,
    output_language: str = "es",
) -> str:
    """
    Informe OSINT de persona vía DeepSeek (nombre histórico de la función).
    """
    load_env()
    if not deepseek_api_key():
        raise RuntimeError(
            "Falta DEEPSEEK_API_KEY en `.env` para el informe de persona con IA."
        )

    if (os.getenv("DEEPSEEK_DISABLE_PERSON_WEB") or os.getenv("GEMINI_DISABLE_GOOGLE_SEARCH") or "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        raise RuntimeError(
            "El informe de persona por IA está desactivado (DEEPSEEK_DISABLE_PERSON_WEB=1)."
        )

    m = (
        model
        or os.getenv("DEEPSEEK_PERSON_WEB_MODEL")
        or os.getenv("DEEPSEEK_MODEL")
        or deepseek_model()
    ).strip()

    user_prompt = _build_user_prompt(filters, meeting_context)
    return chat_completion(
        user_prompt,
        system_instruction=person_dossier_system_prompt(
            meeting_context=meeting_context,
            output_language=output_language,
        ),
        model=m,
        max_retries=max_retries,
    )
