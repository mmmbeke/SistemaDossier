"""Pruebas de integración con PostgreSQL (registro, listado de dossiers)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.integration
@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient, registered_user: dict[str, str]) -> None:
    res = await client.post(
        "/auth/login",
        json={"email": registered_user["email"], "password": registered_user["password"]},
    )
    assert res.status_code == 200
    assert res.json().get("access_token")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_auth_me_with_valid_token(
    client: AsyncClient, auth_headers: dict[str, str], registered_user: dict[str, str]
) -> None:
    res = await client.get("/auth/me", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == registered_user["email"]
    assert body.get("organization_id")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_list_dossiers_empty_for_new_user(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    res = await client.get("/dossiers?limit=10", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "organization_id" in body
    assert isinstance(body.get("items"), list)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_dossier_jobs_list_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/dossier-generation-jobs")
    assert res.status_code == 401


@pytest.mark.integration
@pytest.mark.asyncio
async def test_dossier_jobs_list_for_authenticated_user(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    res = await client.get("/dossier-generation-jobs", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "jobs" in body
    assert isinstance(body["jobs"], list)


@pytest.mark.integration
@pytest.mark.security
@pytest.mark.asyncio
async def test_non_admin_cannot_access_admin_users(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    res = await client.get("/admin/users", headers=auth_headers)
    assert res.status_code in (403, 404)
