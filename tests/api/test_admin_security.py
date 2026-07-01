"""Admin: validación de paginación."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.integration
@pytest.mark.asyncio
async def test_admin_list_rejects_huge_offset(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    res = await client.get(
        "/admin/users",
        params={"limit": 3, "offset": 25904816321383018496},
        headers=auth_headers,
    )
    assert res.status_code in (403, 422)
