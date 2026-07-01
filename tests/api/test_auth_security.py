"""Pruebas de seguridad en autenticación y JWT."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.security
@pytest.mark.asyncio
async def test_dossiers_without_token_returns_401(client: AsyncClient) -> None:
    res = await client.get("/dossiers")
    assert res.status_code == 401
    assert "Authorization" in res.json().get("detail", "")


@pytest.mark.security
@pytest.mark.asyncio
async def test_dossiers_with_invalid_token_returns_401(
    client: AsyncClient, auth_headers_invalid: dict[str, str]
) -> None:
    res = await client.get("/dossiers", headers=auth_headers_invalid)
    assert res.status_code == 401


@pytest.mark.security
@pytest.mark.asyncio
async def test_auth_me_without_token_returns_401(client: AsyncClient) -> None:
    res = await client.get("/auth/me")
    assert res.status_code == 401


@pytest.mark.security
@pytest.mark.asyncio
async def test_admin_overview_without_token_returns_401(client: AsyncClient) -> None:
    res = await client.get("/admin/overview")
    assert res.status_code in (401, 404)


@pytest.mark.security
@pytest.mark.asyncio
async def test_register_rejects_short_password(client: AsyncClient) -> None:
    res = await client.post(
        "/auth/register",
        json={
            "email": "short-pass@example.com",
            "password": "abc",
            "full_name": "Test",
            "company_name": "Co",
        },
    )
    assert res.status_code == 422


@pytest.mark.security
@pytest.mark.integration
@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(
    client: AsyncClient, registered_user: dict[str, str]
) -> None:
    res = await client.post(
        "/auth/login",
        json={"email": registered_user["email"], "password": "WrongPassword99!"},
    )
    assert res.status_code == 401
