"""Tests — rutas legacy abiertas (deshabilitadas por defecto)."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from dossier.security import legacy_routes


def test_legacy_routes_disabled_by_default(monkeypatch):
    monkeypatch.delenv("DOSSIER_ENABLE_LEGACY_OPEN_ROUTES", raising=False)
    assert legacy_routes.legacy_open_routes_enabled() is False
    with pytest.raises(HTTPException) as exc:
        legacy_routes.assert_legacy_route_allowed()
    assert exc.value.status_code == 404


def test_legacy_routes_enabled_with_env(monkeypatch):
    monkeypatch.setenv("DOSSIER_ENABLE_LEGACY_OPEN_ROUTES", "1")
    assert legacy_routes.legacy_open_routes_enabled() is True
    legacy_routes.assert_legacy_route_allowed()
