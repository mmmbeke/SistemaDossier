"""
Rutas HTTP de registro e inicio de sesión alineadas con el schema PostgreSQL migrado.

Tablas: `organizations`, `users`, `org_memberships` (ver `docs/sql/schema_project_dossier.sql`).

Registro:
1. Crea una organización (tenant) con el nombre de empresa y un `slug` único.
2. Crea el usuario con hash de contraseña.
3. Crea membresía `admin` + `is_primary_org=True`.

El JWT incluye `org_id` para multi-tenant en rutas como `GET /dossiers`.
"""
from __future__ import annotations

import os
import re
import secrets
from collections.abc import Generator
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from jwt.exceptions import PyJWTError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from dossier.db import is_database_configured
from dossier.db.models import Organization, OrgMembership, User
from dossier.db.session import get_db
from dossier.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserPublic
from dossier.security import create_access_token, hash_password, verify_password
from dossier.security.jwt_tokens import decode_access_token

router = APIRouter(prefix="/auth", tags=["Autenticación app"])


def _signup_org_credits() -> tuple[int, int]:
    """
    Créditos iniciales de la organización al registrarse (`/auth/register`).

    Variables opcionales en `.env`:
    - `ORG_SIGNUP_CREDITS` — saldo inicial (≥ 0). Por defecto 500.
    - `ORG_SIGNUP_CREDITS_MONTHLY_LIMIT` — tope mensual; si no se define, igual al saldo.
    """

    def _parse(name: str, default: int) -> int:
        raw = os.getenv(name)
        if raw is None or not str(raw).strip():
            return default
        try:
            v = int(str(raw).strip())
        except ValueError:
            return default
        return max(0, v)

    balance = _parse("ORG_SIGNUP_CREDITS", 500)
    lim_raw = os.getenv("ORG_SIGNUP_CREDITS_MONTHLY_LIMIT")
    if lim_raw is not None and str(lim_raw).strip():
        limit = _parse("ORG_SIGNUP_CREDITS_MONTHLY_LIMIT", balance)
    else:
        limit = balance
    return balance, limit


def get_db_if_configured() -> Generator[Session, None, None]:
    """Igual que `get_db`, pero responde 503 si no hay `DATABASE_URL` / `POSTGRES_*`."""
    if not is_database_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "PostgreSQL no está configurado. Define DATABASE_URL o POSTGRES_* en .env "
                "en la raíz del proyecto."
            ),
        )
    yield from get_db()


def _require_jwt_secret() -> None:
    try:
        from dossier.security.jwt_tokens import assert_jwt_secret_configured

        assert_jwt_secret_configured()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


def _slug_base_from_company(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")[:80]
    return s or "org"


def allocate_org_slug(db: Session, company_name: str) -> str:
    """Genera un `slug` único para `organizations.slug` (máx. 100 caracteres)."""
    base = _slug_base_from_company(company_name)[:100]
    candidate = base
    for _ in range(64):
        exists = db.execute(
            select(Organization.id).where(Organization.slug == candidate)
        ).first()
        if not exists:
            return candidate
        suffix = secrets.token_hex(3)
        candidate = f"{base[:88]}-{suffix}"[:100]
    return f"org-{secrets.token_hex(8)}"[:100]


def load_primary_membership(
    db: Session, user_id: UUID
) -> tuple[Organization, OrgMembership] | None:
    """Organización primaria del usuario, o la primera membresía por fecha."""
    q = (
        select(Organization, OrgMembership)
        .join(OrgMembership, OrgMembership.organization_id == Organization.id)
        .where(OrgMembership.user_id == user_id, OrgMembership.is_primary_org.is_(True))
        .limit(1)
    )
    row = db.execute(q).first()
    if row:
        return row[0], row[1]
    q2 = (
        select(Organization, OrgMembership)
        .join(OrgMembership, OrgMembership.organization_id == Organization.id)
        .where(OrgMembership.user_id == user_id)
        .order_by(OrgMembership.joined_at)
        .limit(1)
    )
    row2 = db.execute(q2).first()
    if row2:
        return row2[0], row2[1]
    return None


def build_user_public(db: Session, user: User) -> UserPublic:
    pair = load_primary_membership(db, user.id)
    if not pair:
        raise HTTPException(
            status_code=500,
            detail="Usuario sin membresía de organización.",
        )
    org, m = pair
    return UserPublic(
        id=user.id,
        email=user.email,
        full_name=user.full_name or "",
        company_name=org.name,
        organization_id=org.id,
        role=m.role,
    )


def auth_payload_and_user(db: Session, authorization: str | None) -> tuple[dict, User]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail="Falta la cabecera Authorization: Bearer <token>.",
        )
    token = authorization[7:].strip()
    try:
        payload = decode_access_token(token)
    except PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.") from None

    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Token sin identificador de usuario.")

    try:
        user_uuid = UUID(sub)
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Token corrupto.") from e

    user = db.get(User, user_uuid)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario no encontrado o inactivo.")
    return payload, user


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db_if_configured),
) -> User:
    """Dependencia: usuario autenticado por JWT (sin comprobar org explícitamente)."""
    _, user = auth_payload_and_user(db, authorization)
    return user


def get_current_user_and_org(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db_if_configured),
) -> tuple[User, Organization]:
    """
    Dependencia: usuario + organización del claim `org_id` del JWT.

    Usar en rutas multi-tenant (listados de dossiers, contactos, etc.).
    """
    payload, user = auth_payload_and_user(db, authorization)
    org_id_raw = payload.get("org_id")
    if not org_id_raw or not isinstance(org_id_raw, str):
        raise HTTPException(
            status_code=401,
            detail="Token sin organización (sesión antigua). Vuelve a iniciar sesión.",
        )
    try:
        org_uuid = UUID(org_id_raw)
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Token corrupto (organización).") from e

    org = db.get(Organization, org_uuid)
    if org is None or not org.is_active:
        raise HTTPException(status_code=401, detail="Organización no encontrada o inactiva.")

    m = db.execute(
        select(OrgMembership).where(
            OrgMembership.user_id == user.id,
            OrgMembership.organization_id == org.id,
        )
    ).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=403, detail="No perteneces a esta organización.")
    return user, org


@router.post("/register", response_model=TokenResponse)
def register_user(
    body: RegisterRequest, db: Session = Depends(get_db_if_configured)
) -> TokenResponse:
    _require_jwt_secret()
    email_norm = body.email.lower().strip()

    existing = db.execute(select(User).where(User.email == email_norm)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="Ya existe una cuenta con este email. Prueba a iniciar sesión.",
        )

    slug = allocate_org_slug(db, body.company_name)
    credits_balance, credits_monthly_limit = _signup_org_credits()
    org = Organization(
        name=body.company_name.strip()[:255],
        slug=slug,
        credits_balance=credits_balance,
        credits_monthly_limit=credits_monthly_limit,
    )
    user = User(
        email=email_norm,
        email_verified=False,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip()[:255],
        locale="es",
    )
    db.add(org)
    db.flush()
    db.add(user)
    db.flush()
    membership = OrgMembership(
        organization_id=org.id,
        user_id=user.id,
        role="admin",
        is_primary_org=True,
    )
    db.add(membership)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No se pudo completar el registro (dato duplicado). Reintenta con otro nombre de empresa.",
        ) from None

    db.refresh(user)
    db.refresh(org)

    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        organization_id=str(org.id),
    )
    return TokenResponse(
        access_token=token,
        user=UserPublic(
            id=user.id,
            email=user.email,
            full_name=user.full_name or "",
            company_name=org.name,
            organization_id=org.id,
            role=membership.role,
        ),
    )


@router.post("/login", response_model=TokenResponse)
def login_user(body: LoginRequest, db: Session = Depends(get_db_if_configured)) -> TokenResponse:
    _require_jwt_secret()
    email_norm = body.email.lower().strip()
    user = db.execute(select(User).where(User.email == email_norm)).scalar_one_or_none()

    generic = "Email o contraseña incorrectos."
    if user is None or not user.password_hash:
        raise HTTPException(status_code=401, detail=generic)
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail=generic)

    pair = load_primary_membership(db, user.id)
    if not pair:
        raise HTTPException(
            status_code=500,
            detail="Cuenta sin organización asociada. Contacta soporte.",
        )
    org, membership = pair

    user.last_login_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        organization_id=str(org.id),
    )
    return TokenResponse(
        access_token=token,
        user=UserPublic(
            id=user.id,
            email=user.email,
            full_name=user.full_name or "",
            company_name=org.name,
            organization_id=org.id,
            role=membership.role,
        ),
    )


@router.get("/me", response_model=UserPublic)
def read_current_user(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_if_configured),
) -> UserPublic:
    return build_user_public(db, user)
