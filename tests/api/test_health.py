"""Pruebas de salud y endpoints públicos."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root_returns_api_info(client: AsyncClient) -> None:
    res = await client.get("/")
    assert res.status_code == 200
    body = res.json()
    assert "Project Dossier" in body.get("message", "")


@pytest.mark.asyncio
async def test_health_ok(client: AsyncClient) -> None:
    res = await client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "version" in body
    assert "cors" in body
    assert "dossier_redis" in body


@pytest.mark.asyncio
async def test_db_health_responds(client: AsyncClient) -> None:
    res = await client.get("/db/health")
    # 200 si PostgreSQL ok; 503 si error de conexión; 200 con not_configured si no hay .env
    assert res.status_code in (200, 503)
    body = res.json()
    assert "postgresql" in body
