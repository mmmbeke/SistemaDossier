"""Persistencia de tokens OAuth de calendario (Microsoft Graph y Google Calendar)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from dossier.db.models import CalendarIntegration


def _initial_advance_minutes() -> int:
    """Valor inicial de anticipación al crear una integración (evita import circular)."""
    from dossier.services.calendar_automation import default_advance_minutes

    return default_advance_minutes()


def upsert_microsoft_calendar_tokens(
    db: Session,
    *,
    user_id: UUID,
    organization_id: UUID,
    access_token: str,
    refresh_token: str | None,
    expires_in_seconds: int,
    granted_scopes: str,
    id_token_claims: dict,
) -> CalendarIntegration:
    """
    Inserta o actualiza la fila ``calendar_integrations`` para ``provider='microsoft'``.

    Los campos ``*_encrypted`` guardan el valor en claro por ahora (MVP); cifrar en app antes.
    """
    claims = id_token_claims or {}
    provider_email = (claims.get("preferred_username") or claims.get("email") or None)
    if isinstance(provider_email, str):
        provider_email = provider_email.strip() or None
    provider_subject = (
        claims.get("oid") or claims.get("sub") or (str(provider_email) if provider_email else None)
    )
    if provider_subject is not None:
        provider_subject = str(provider_subject)[:255]

    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=max(60, int(expires_in_seconds or 3600))
    )

    row = db.execute(
        select(CalendarIntegration).where(
            CalendarIntegration.user_id == user_id,
            CalendarIntegration.provider == "microsoft",
        )
    ).scalar_one_or_none()

    if row is None:
        row = CalendarIntegration(
            user_id=user_id,
            organization_id=organization_id,
            provider="microsoft",
            advance_minutes=_initial_advance_minutes(),
        )
        db.add(row)

    row.organization_id = organization_id
    row.access_token_encrypted = access_token
    row.refresh_token_encrypted = refresh_token
    row.access_token_expires_at = expires_at
    row.granted_scopes = granted_scopes or None
    row.provider_email = provider_email
    row.provider_subject = provider_subject
    row.revoked_at = None
    row.is_enabled = True

    db.commit()
    db.refresh(row)
    return row


def upsert_google_calendar_tokens(
    db: Session,
    *,
    user_id: UUID,
    organization_id: UUID,
    access_token: str,
    refresh_token: str | None,
    expires_in_seconds: int,
    granted_scopes: str,
    userinfo: dict | None,
) -> CalendarIntegration:
    """
    Inserta o actualiza ``calendar_integrations`` para ``provider='google'``.

    ``userinfo`` suele venir de ``GET https://www.googleapis.com/oauth2/v2/userinfo``.
    """
    info = userinfo if userinfo is not None else {}
    provider_email = info.get("email") if info else None
    if isinstance(provider_email, str):
        provider_email = provider_email.strip() or None
    sub = info.get("id") or info.get("sub") if info else None
    provider_subject = None
    if sub is not None:
        provider_subject = str(sub)[:255]
    elif provider_email:
        provider_subject = str(provider_email)[:255]

    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=max(60, int(expires_in_seconds or 3600))
    )

    row = db.execute(
        select(CalendarIntegration).where(
            CalendarIntegration.user_id == user_id,
            CalendarIntegration.provider == "google",
        )
    ).scalar_one_or_none()

    if row is None:
        row = CalendarIntegration(
            user_id=user_id,
            organization_id=organization_id,
            provider="google",
            advance_minutes=_initial_advance_minutes(),
        )
        db.add(row)

    row.organization_id = organization_id
    row.access_token_encrypted = access_token
    if refresh_token:
        row.refresh_token_encrypted = refresh_token
    row.access_token_expires_at = expires_at
    row.granted_scopes = granted_scopes or None
    if userinfo is not None:
        row.provider_email = provider_email
        row.provider_subject = provider_subject
    row.revoked_at = None
    row.is_enabled = True

    db.commit()
    db.refresh(row)
    return row
