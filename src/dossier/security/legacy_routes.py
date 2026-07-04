"""Rutas legacy sin JWT (deshabilitadas por defecto en producción)."""
from __future__ import annotations

import os

from fastapi import HTTPException


def legacy_open_routes_enabled() -> bool:
    """True solo si ``DOSSIER_ENABLE_LEGACY_OPEN_ROUTES=1`` (desarrollo / migración)."""
    raw = os.getenv("DOSSIER_ENABLE_LEGACY_OPEN_ROUTES", "0").strip().lower()
    return raw in ("1", "true", "yes", "on")


def assert_legacy_route_allowed() -> None:
    """Responde 404 para no anunciar endpoints abiertos cuando están desactivados."""
    if legacy_open_routes_enabled():
        return
    raise HTTPException(status_code=404, detail="Not found")
