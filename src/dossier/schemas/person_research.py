"""Solicitud para informe de persona (Netrows + Gemini)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class PersonResearchRequest(BaseModel):
    """Filtros para acotar la búsqueda en Netrows (`/people/search`)."""

    full_name: str = Field(..., min_length=2, max_length=200, description="Nombre completo")
    job_area: str | None = Field(
        None,
        max_length=200,
        description="Área o cargo típico (mapea a keywordTitle)",
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
    max_profiles: int = Field(1, ge=1, le=5, description="Cuántos perfiles enriquecer con /people/profile")
    include_posts: bool = Field(False, description="Si true, llama /people/posts por perfil")
