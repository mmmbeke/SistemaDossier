"""Calendario: validación de access_token legacy en query."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.integration
@pytest.mark.asyncio
async def test_calendar_diagnostico_rejects_non_ascii_access_token(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    res = await client.get(
        "/calendario/diagnostico-google",
        params={"access_token": "tokén\u000e92de"},
        headers=auth_headers,
    )
    assert res.status_code == 422


@pytest.mark.integration
@pytest.mark.asyncio
async def test_calendar_eventos_documents_400_for_bad_token(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    res = await client.get(
        "/calendario/eventos-google",
        params={"access_token": "not-a-real-google-token"},
        headers=auth_headers,
    )
    assert res.status_code == 400
    assert "detail" in res.json()
