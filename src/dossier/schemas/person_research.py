"""Solicitud para informe de persona (IA + web o Lusha + Gemini)."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, field_validator


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
        description="Área o cargo (contexto para Lusha y el informe)",
    )
    company: str | None = Field(None, max_length=200)
    country: str | None = Field(None, max_length=120, description="País / región")
    city: str | None = Field(None, max_length=120, description="Opcional; se usa como contexto geo")
    extra_keywords: str | None = Field(
        None,
        max_length=400,
        description="Palabras clave adicionales (escuela, sector, etc.)",
    )
    start: int = Field(0, ge=0, le=10_000)
    max_profiles: int = Field(1, ge=1, le=5, description="Cuántos perfiles Lusha usar en el análisis")
    reveal_contact_details: bool = Field(
        False,
        description="Si true, Lusha revela email/teléfono al enriquecer (consume créditos). Solo lusha.",
    )
    include_posts: bool = Field(
        False,
        description="Reservado; Lusha no expone publicaciones (se ignora con research_source=lusha)",
    )
    research_source: PersonResearchSource = Field(
        default=PersonResearchSource.lusha,
        description="lusha: API Lusha + Gemini (por defecto); gemini_web: IA + Google Search",
    )

    @field_validator("research_source", mode="before")
    @classmethod
    def _coerce_legacy_netrows(cls, v: object) -> object:
        if v == "netrows":
            return "lusha"
        return v
