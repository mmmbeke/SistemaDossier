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

# Instrucciones en el idioma objetivo (más fiables que solo decir «francés» en español).
_DOSSIER_LANGUAGE_BLOCKS: dict[str, str] = {
    "en": (
        "**Mandatory output language:** Write the **entire** executive dossier in **English** "
        "(section titles, tables, bullet points, risk levels, and recommendations). "
        "Do **not** leave Spanish headings from the template (e.g. translate "
        "«FICHA DE IDENTIDAD» → «IDENTITY CARD», «RESUMEN EJECUTIVO» → «EXECUTIVE SUMMARY»). "
        "Keep bracket tags in English where applicable: [INFERENCE], [OBSERVATION], "
        "[INCONSISTENCY], [LOW ALERT], [MODERATE ALERT], [CRITICAL ALERT]. "
        "Maintain a formal executive tone."
    ),
    "pt": (
        "**Idioma de saída obrigatório:** redija **todo** o dossiê executivo em **português** "
        "(títulos de seção, tabelas, marcadores, níveis de risco e recomendações). "
        "Não deixe títulos em espanhol do modelo (ex.: «FICHA DE IDENTIDAD» → "
        "«FICHA DE IDENTIDADE», «RESUMEN EJECUTIVO» → «RESUMO EXECUTIVO»). "
        "Use etiquetas entre colchetes em português quando fizer sentido: [INFERÊNCIA], "
        "[OBSERVAÇÃO], [INCONSISTÊNCIA], [ALERTA LEVE], [ALERTA MODERADA], [ALERTA CRÍTICA]. "
        "Tom formal e executivo."
    ),
    "it": (
        "**Lingua di output obbligatoria:** redigi **l'intero** dossier esecutivo in **italiano** "
        "(titoli di sezione, tabelle, elenchi, livelli di rischio e raccomandazioni). "
        "Non lasciare titoli in spagnolo del modello (es. «FICHA DE IDENTIDAD» → "
        "«SCHEDA IDENTITÀ», «RESUMEN EJECUTIVO» → «SOMMARIO ESECUTIVO»). "
        "Usa tag tra parentesi quadre in italiano: [INFERENZA], [OSSERVAZIONE], "
        "[INCOERENZA], [ALLERTA LIEVE], [ALLERTA MODERATA], [ALLERTA CRITICA]. "
        "Tono formale ed esecutivo."
    ),
    "fr": (
        "**Langue de sortie obligatoire :** rédigez **l'intégralité** du dossier exécutif en **français** "
        "(titres de section, tableaux, puces, niveaux de risque et recommandations). "
        "Ne conservez pas les titres espagnols du modèle (ex. « FICHA DE IDENTIDAD » → "
        "« FICHE D'IDENTITÉ », « RESUMEN EJECUTIVO » → « RÉSUMÉ EXÉCUTIF »). "
        "Utilisez des balises entre crochets en français : [INFÉRENCE], [OBSERVATION], "
        "[INCOHÉRENCE], [ALERTE LÉGÈRE], [ALERTE MODÉRÉE], [ALERTE CRITIQUE]. "
        "Ton formel et exécutif."
    ),
    "de": (
        "**Ausgabesprache (Pflicht):** Verfassen Sie den **gesamten** Executive-Dossier-Bericht auf **Deutsch** "
        "(Abschnittstitel, Tabellen, Aufzählungen, Risikoniveaus und Empfehlungen). "
        "Lassen Sie keine spanischen Überschriften aus der Vorlage stehen (z. B. «FICHA DE IDENTIDAD» → "
        "«IDENTITÄTSÜBERSICHT», «RESUMEN EJECUTIVO» → «EXECUTIVE SUMMARY»). "
        "Verwenden Sie Klammer-Tags auf Deutsch: [INFERENZ], [BEOBACHTUNG], "
        "[INKONSISTENZ], [LEICHTE WARNUNG], [MODERATE WARNUNG], [KRITISCHE WARNUNG]. "
        "Formeller, sachlicher Executive-Ton."
    ),
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
    normalized = normalize_output_language(code)
    if normalized == "es":
        return ""
    block = _DOSSIER_LANGUAGE_BLOCKS.get(normalized)
    if block:
        return f"\n\n{block}"
    lang = _LANGUAGE_LABELS.get(normalized, "español")
    return (
        f"\n\n**Idioma de salida obligatorio:** redacta **todo** el informe en **{lang}** "
        f"(incluidos títulos de sección, tablas y viñetas). Mantén el tono ejecutivo."
    )


def apply_output_language_to_system_prompt(system: str, code: str) -> str:
    """Ajusta prompts que asumen español (corporativo y persona)."""
    normalized = normalize_output_language(code)
    if normalized == "es":
        return system
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
    block = dossier_language_instruction(normalized)
    if block and block not in updated:
        updated = updated + block
    return updated
