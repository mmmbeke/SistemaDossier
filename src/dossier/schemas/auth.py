"""Esquemas Pydantic para registro, login y respuestas públicas de usuario."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    """Cuerpo POST /auth/register — coincide con los campos del formulario Next.js."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    company_name: str = Field(min_length=1, max_length=255)

    @field_validator("full_name", "company_name")
    @classmethod
    def strip_not_empty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("no puede quedar vacío")
        return s


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserPublic(BaseModel):
    """Perfil público + tenant activo (organización primaria)."""

    id: UUID
    email: str
    full_name: str
    company_name: str
    organization_id: UUID
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
