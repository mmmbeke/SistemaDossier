"""Contrato OpenAPI: esquema válido y rutas críticas documentadas."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_openapi_json_available(client: AsyncClient) -> None:
    res = await client.get("/openapi.json")
    assert res.status_code == 200
    schema = res.json()
    assert schema.get("openapi", "").startswith("3.")
    assert "paths" in schema


@pytest.mark.asyncio
async def test_openapi_includes_core_paths(client: AsyncClient) -> None:
    res = await client.get("/openapi.json")
    paths = res.json().get("paths", {})
    for path in (
        "/health",
        "/auth/login",
        "/auth/register",
        "/dossiers",
        "/dossier-generation-jobs",
    ):
        assert path in paths, f"Falta {path} en OpenAPI"
