"""Esquemas Pydantic para registro, login y respuestas públicas de usuario."""
from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class RegisterRequest(BaseModel):
    """Cuerpo POST /auth/register — coincide con los campos del formulario Next.js."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    company_name: str | None = Field(default=None, max_length=255)
    workspace_kind: Literal["personal", "work"] = "work"

    @model_validator(mode="before")
    @classmethod
    def infer_workspace_kind_if_omitted(cls, data: Any) -> Any:
        """
        Clientes antiguos u omiten `workspace_kind`: si no hay nombre de empresa,
        asumir cuenta personal (evita 422). Si hay `company_name`, asumir work.
        """
        if not isinstance(data, dict):
            return data
        out = dict(data)
        raw_wk = out.get("workspace_kind")
        if isinstance(raw_wk, str):
            wk = raw_wk.strip().lower()
            out["workspace_kind"] = wk if wk in ("personal", "work") else None
        elif raw_wk is not None:
            out["workspace_kind"] = None

        wk = out.get("workspace_kind")
        if wk not in ("personal", "work"):
            cn = out.get("company_name")
            cn_str = cn.strip() if isinstance(cn, str) else ""
            out["workspace_kind"] = "work" if cn_str else "personal"
        return out

    @field_validator("full_name")
    @classmethod
    def strip_full_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("no puede quedar vacío")
        return s

    @field_validator("company_name", mode="before")
    @classmethod
    def empty_company_to_none(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            t = v.strip()
            return t or None
        return None

    @model_validator(mode="after")
    def company_required_for_work(self) -> RegisterRequest:
        if self.workspace_kind == "work":
            cn = (self.company_name or "").strip()
            if not cn:
                raise ValueError("company_name es obligatorio para cuenta de empresa")
            self.company_name = cn
        else:
            self.company_name = None
        return self


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
    is_platform_admin: bool = False
    organization_plan: str = "free"
    credits_balance: int = 0
    credits_monthly_limit: int = 0
    workspace_kind: Literal["personal", "work"] = "work"
    # Contexto opcional (JSON `organizations.settings.dossier_context`) para personalizar dossiers.
    organization_company_summary: str | None = None
    organization_industry_or_area: str | None = None


class OrganizationPlanPatch(BaseModel):
    """Cuerpo PATCH /auth/organization/plan — solo administradores de la organización."""

    plan: Literal["free", "pro", "enterprise"]


class OrganizationDossierContextPatch(BaseModel):
    """Cuerpo PATCH /auth/organization/dossier-context — solo administradores de la organización."""

    company_summary: str = Field(default="", max_length=4000)
    industry_or_area: str = Field(default="", max_length=500)

    @field_validator("company_summary", "industry_or_area", mode="before")
    @classmethod
    def strip_text(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
