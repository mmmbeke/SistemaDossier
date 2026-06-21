"""Solicitud para informe de persona (IA + web o Lusha + Gemini)."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class PersonResearchSource(str, Enum):
    """Origen de la investigación (elige uno en cada petición)."""

    gemini_web = "gemini_web"
    lusha = "lusha"


class PersonResearchRequest(BaseModel):
    """Filtros para investigación de persona."""

    full_name: str = Field(..., min_length=2, max_length=200, description="Nombre completo")
    job_area: str | None = Field(
        None,
        max_length=200,
        description="Área o cargo típico (contexto para Gemini; Lusha no lo usa en search básico)",
    )
    company: str | None = Field(None, max_length=200)
    country: str | None = Field(None, max_length=120, description="País (contexto para Gemini)")
    city: str | None = Field(None, max_length=120, description="Ciudad (contexto para Gemini)")
    extra_keywords: str | None = Field(
        None,
        max_length=400,
        description="Palabras clave adicionales (escuela, sector, etc.)",
    )
    start: int = Field(0, ge=0, le=10_000)
    max_profiles: int = Field(
        1, ge=1, le=5, description="Cuántos contactos Lusha conservar (solo research_source=lusha)"
    )
    reveal_contact_details: bool = Field(
        False,
        description="Si true, Lusha revela email/teléfono (consume créditos). Solo lusha.",
    )
    research_source: PersonResearchSource = Field(
        default=PersonResearchSource.gemini_web,
        description="gemini_web: IA + Google Search; lusha: API Lusha + Gemini sobre perfiles",
    )
