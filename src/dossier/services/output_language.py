"""Idioma de salida de dossiers (configuración UI → prompts LLM)."""
from __future__ import annotations

import re

# Códigos normalizados que el pipeline entiende.
SUPPORTED_OUTPUT_CODES = frozenset({"es", "en", "pt", "it", "fr", "de"})

_LANGUAGE_LABELS: dict[str, str] = {
    "es": "español",
    "en": "inglés",
    "pt": "portugués",
    "it": "italiano",
    "fr": "francés",
    "de": "alemán",
}


def normalize_output_language(raw: str | None) -> str:
    """Normaliza locale/código de salida; por defecto español."""
    if not raw or not str(raw).strip():
        return "es"
    code = str(raw).strip().lower().replace("_", "-")
    if code.startswith("en"):
        return "en"
    if code.startswith("es"):
        return "es"
    if code.startswith("pt"):
        return "pt"
    if code.startswith("it"):
        return "it"
    if code.startswith("fr"):
        return "fr"
    if code.startswith("de"):
        return "de"
    return "es"


def resolve_output_language_from_user_locale(user_locale: str | None) -> str:
    """Fallback servidor (calendario/automatización): locale de cuenta en PostgreSQL."""
    return normalize_output_language(user_locale)


def dossier_language_instruction(code: str) -> str:
    """Bloque corto para anexar a prompts de sistema."""
    lang = _LANGUAGE_LABELS.get(normalize_output_language(code), "español")
    return (
        f"\n\n**Idioma de salida obligatorio:** redacta **todo** el informe en **{lang}** "
        f"(incluidos títulos de sección, tablas y viñetas). Mantén el tono ejecutivo."
    )


def apply_output_language_to_system_prompt(system: str, code: str) -> str:
    """Ajusta prompts que asumen español (corporativo y persona)."""
    normalized = normalize_output_language(code)
    lang = _LANGUAGE_LABELS[normalized]
    updated = system
    for pattern, repl in (
        (r"Redactas en español,\s*en Markdown\.?", f"Redactas en {lang}, en Markdown."),
        (r"- Redacta en \*\*español\*\*\.?", f"- Redacta en **{lang}**."),
        (r"Redacta en \*\*español\*\*\.?", f"Redacta en **{lang}**."),
        (
            r"- Redacta en el idioma indicado por la configuración de salida del dossier\.?",
            f"- Redacta en **{lang}**.",
        ),
    ):
        updated = re.sub(pattern, repl, updated, count=1, flags=re.IGNORECASE)
    if dossier_language_instruction(normalized) not in updated:
        updated = updated + dossier_language_instruction(normalized)
    return updated
