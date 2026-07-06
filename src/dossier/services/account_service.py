"""Cambio de credenciales y eliminación de cuenta del usuario autenticado."""
from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from dossier.db.models import (
    Dossier,
    DossierGenerationJob,
    DossierShare,
    OrgInvite,
    OrgMembership,
    Organization,
    User,
)
from dossier.security import hash_password, verify_password
from dossier.security.rbac import normalize_org_role
from dossier.services.dossier_deletion_service import delete_dossier_record, finalize_dossier_deletions


def _require_password(user: User, password: str) -> None:
    if not user.password_hash:
        raise HTTPException(
            status_code=400,
            detail="Esta cuenta no tiene contraseña configurada.",
        )
    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Contraseña incorrecta.")


def change_user_password(
    db: Session,
    *,
    user: User,
    current_password: str,
    new_password: str,
) -> None:
    _require_password(user, current_password)
    user.password_hash = hash_password(new_password)
    db.add(user)
    db.commit()


def change_user_email(
    db: Session,
    *,
    user: User,
    new_email: str,
    current_password: str,
) -> User:
    _require_password(user, current_password)
    email_norm = new_email.lower().strip()
    if email_norm == user.email.lower():
        raise HTTPException(status_code=400, detail="El correo es el mismo que el actual.")
    taken = db.execute(select(User.id).where(User.email == email_norm)).scalar_one_or_none()
    if taken is not None:
        raise HTTPException(
            status_code=409,
            detail="Ya existe una cuenta con este email.",
        )
    user.email = email_norm
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _count_org_members(db: Session, organization_id: UUID) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(OrgMembership)
            .where(OrgMembership.organization_id == organization_id)
        ).scalar_one()
        or 0
    )


def _count_org_admins(db: Session, organization_id: UUID) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(OrgMembership)
            .where(
                OrgMembership.organization_id == organization_id,
                OrgMembership.role == "admin",
            )
        ).scalar_one()
        or 0
    )


def _assert_can_delete_account(db: Session, user: User) -> list[OrgMembership]:
    if user.is_platform_admin:
        raise HTTPException(
            status_code=400,
            detail=(
                "No puedes eliminar una cuenta con rol de administrador de plataforma. "
                "Quita ese rol antes de continuar."
            ),
        )

    memberships = db.execute(
        select(OrgMembership).where(OrgMembership.user_id == user.id)
    ).scalars().all()
    for membership in memberships:
        members = _count_org_members(db, membership.organization_id)
        if members <= 1:
            continue
        if normalize_org_role(membership.role) == "admin" and _count_org_admins(db, membership.organization_id) <= 1:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Eres el único administrador de una organización con más miembros. "
                    "Asigna otro administrador antes de eliminar tu cuenta."
                ),
            )
    return memberships


def delete_user_account(db: Session, *, user: User, current_password: str) -> None:
    _require_password(user, current_password)
    memberships = _assert_can_delete_account(db, user)

    dossiers = db.execute(
        select(Dossier).where(Dossier.requested_by_user_id == user.id)
    ).scalars().all()
    calendar_event_ids: set[UUID | None] = set()
    for dossier in dossiers:
        calendar_event_ids.add(delete_dossier_record(db, dossier))

    db.execute(
        delete(DossierGenerationJob).where(DossierGenerationJob.requested_by_user_id == user.id)
    )
    db.execute(
        delete(DossierShare).where(DossierShare.shared_by_user_id == user.id)
    )
    db.execute(
        delete(OrgInvite).where(OrgInvite.invited_by_user_id == user.id)
    )

    orgs_to_delete: list[UUID] = []
    for membership in memberships:
        if _count_org_members(db, membership.organization_id) <= 1:
            orgs_to_delete.append(membership.organization_id)
        else:
            db.delete(membership)

    db.flush()
    finalize_dossier_deletions(db, calendar_event_ids)

    for org_id in orgs_to_delete:
        org = db.get(Organization, org_id)
        if org is not None:
            db.delete(org)

    db.delete(user)
    db.commit()
