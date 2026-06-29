"""Política de créditos compartida (generación manual, calendario y jobs)."""
from __future__ import annotations

import os

from dossier.db.models import Organization
from dossier.schemas.dossier_generation import DEPTH_CREDITS, DossierDepth

# Módulo identidad (persona) — alineado con plan básico = 1 crédito.
PERSON_IDENTITY_CREDITS = 1


def credit_charging_enabled() -> bool:
    raw = os.getenv("DOSSIER_CHARGE_CREDITS", "true")
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def enterprise_unlimited(org: Organization) -> bool:
    return (org.plan or "").strip().lower() == "enterprise"


def calendar_event_credit_estimate(
    *,
    has_corporate: bool,
    has_person: bool,
    depth: DossierDepth = "standard",
    charge: bool | None = None,
) -> int:
    """Créditos máximos si todo sale bien (corporativo + persona)."""
    if charge is None:
        charge = credit_charging_enabled()
    if not charge:
        return 0
    total = 0
    if has_corporate:
        total += DEPTH_CREDITS[depth]
    if has_person:
        total += PERSON_IDENTITY_CREDITS
    return total
