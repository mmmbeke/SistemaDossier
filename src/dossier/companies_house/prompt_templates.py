"""Plantillas de prompt compartidas (CLI Companies House y pipeline LangGraph)."""
from __future__ import annotations


def format_ch_filing_gemini_prompt(
    *,
    company_name: str,
    company_number: str,
    date: str,
    ftype: str,
    category: str,
    description: str,
) -> str:
    """
    Prompt usado al analizar con Gemini el primer documento descargable del historial CH.

    Debe coincidir con la configuración del CLI (`maybe_analyze_ch_filing_with_gemini`).
    """
    return (
        "Eres un analista corporativo (Reino Unido). Resume en español este documento "
        "presentado en Companies House. Incluye: tipo de hecho o trámite, datos clave "
        "que aparezcan, fechas relevantes y una conclusión breve que sintetice el análisis "
        "e indique si conviene o no trabajar con la empresa (como contraparte comercial o "
        "contractual), con argumentos concretos; si el documento no alcanza para decidirlo, "
        "dilo explícitamente y qué faltaría saber. "
        f"Empresa: {company_name} ({company_number}). "
        f"Presentación: fecha={date}, tipo={ftype}, categoría={category}, descripción={description}."
    )
