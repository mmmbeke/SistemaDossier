"""Solicitud para informe de persona (IA + web o Netrows + Gemini)."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class PersonResearchSource(str, Enum):
    """Origen de la investigación (elige uno en cada petición)."""

    gemini_web = "gemini_web"
    netrows = "netrows"


class PersonResearchRequest(BaseModel):
    """Filtros para investigación de persona."""

    full_name: str = Field(..., min_length=2, max_length=200, description="Nombre completo")
    job_area: str | None = Field(
        None,
        max_length=200,
        description="Área o cargo típico (mapea a keywordTitle en Netrows)",
    )
    company: str | None = Field(None, max_length=200)
    country: str | None = Field(None, max_length=120, description="País / geo (texto libre según Netrows)")
    city: str | None = Field(None, max_length=120, description="Opcional; se concatena con país en `geo`")
    extra_keywords: str | None = Field(
        None,
        max_length=400,
        description="Palabras clave adicionales (escuela, sector, etc.)",
    )
    start: int = Field(0, ge=0, le=10_000)
    max_profiles: int = Field(1, ge=1, le=5, description="Cuántos perfiles enriquecer con /people/profile (solo Netrows)")
    include_posts: bool = Field(False, description="Si true, llama /people/posts por perfil (solo Netrows)")
    research_source: PersonResearchSource = Field(
        default=PersonResearchSource.gemini_web,
        description="gemini_web: IA + Google Search; netrows: API Netrows + Gemini sobre perfiles",
    )
