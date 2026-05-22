"""Listado de dossiers persistidos en PostgreSQL (tabla `dossiers` del schema migrado)."""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from dossier.api.auth_routes import get_current_user_and_org, get_db_if_configured
from dossier.db.models import Dossier, Organization, User

router = APIRouter(tags=["Dossiers"])


@router.get("/dossiers/{dossier_id}")
def get_dossier_by_id(
    dossier_id: UUID,
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    db: Session = Depends(get_db_if_configured),
):
    """Devuelve un dossier si pertenece a la organización del JWT."""
    _user, org = user_org
    d = db.get(Dossier, dossier_id)
    if d is None or d.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Dossier no encontrado.")
    return {
        "id": str(d.id),
        "organization_id": str(d.organization_id),
        "subject_name": d.subject_name,
        "subject_email": d.subject_email,
        "status": d.status,
        "depth_level": d.depth_level,
        "credits_consumed": d.credits_consumed,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        "dossier_data": d.dossier_data,
        "alerts": d.alerts,
    }


@router.get("/dossiers")
def list_dossiers_for_org(
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    db: Session = Depends(get_db_if_configured),
    limit: int = Query(50, ge=1, le=100),
):
    """
    Lista dossiers de la organización activa (`org_id` en el JWT).

    Requiere haber ejecutado el SQL de migración (tabla `dossiers` y dependencias).
    """
    _user, org = user_org
    stmt = (
        select(Dossier)
        .where(Dossier.organization_id == org.id)
        .order_by(Dossier.created_at.desc())
        .limit(limit)
    )
    rows = db.execute(stmt).scalars().all()
    return {
        "organization_id": str(org.id),
        "items": [
            {
                "id": str(r.id),
                "subject_name": r.subject_name,
                "subject_email": r.subject_email,
                "status": r.status,
                "depth_level": r.depth_level,
                "credits_consumed": r.credits_consumed,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                "dossier_data": r.dossier_data,
            }
            for r in rows
        ],
    }
