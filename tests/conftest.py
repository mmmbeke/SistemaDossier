"""Fixtures compartidas para pruebas de la API FastAPI."""
from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

# Desactivar workers en background durante los tests (antes de importar la app).
os.environ.setdefault("DOSSIER_GENERATION_WORKER_ENABLED", "0")
os.environ.setdefault("CALENDAR_AUTOMATION_ENABLED", "0")
os.environ.setdefault("DATABASE_AUTO_CREATE_TABLES", "0")

from dossier.config import load_env

load_env()

os.environ["DOSSIER_GENERATION_WORKER_ENABLED"] = "0"
os.environ["CALENDAR_AUTOMATION_ENABLED"] = "0"

from dossier.api.app import app  # noqa: E402
from dossier.db import is_database_configured  # noqa: E402
from dossier.security.jwt_tokens import assert_jwt_secret_configured  # noqa: E402


def integration_ready() -> bool:
    if not is_database_configured():
        return False
    try:
        assert_jwt_secret_configured()
        return True
    except RuntimeError:
        return False


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.fixture
def auth_headers_invalid() -> dict[str, str]:
    return {"Authorization": "Bearer not-a-valid-jwt"}


@pytest.fixture
async def registered_user(client: AsyncClient) -> dict[str, str]:
  """
  Registra un usuario de prueba y devuelve ``email``, ``password`` y ``access_token``.
  Solo disponible si PostgreSQL y JWT_SECRET están configurados.
  """
  if not integration_ready():
    pytest.skip("Requiere DATABASE_URL/POSTGRES_* y JWT_SECRET en .env")

  suffix = uuid.uuid4().hex[:12]
  email = f"pytest-{suffix}@example.com"
  password = "TestPass123!"
  payload = {
      "email": email,
      "password": password,
      "full_name": "Pytest User",
      "company_name": f"Pytest Org {suffix}",
      "workspace_kind": "work",
  }
  res = await client.post("/auth/register", json=payload)
  assert res.status_code == 200, res.text
  body = res.json()
  token = body.get("access_token")
  assert token
  return {"email": email, "password": password, "access_token": token}


@pytest.fixture
async def auth_headers(registered_user: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {registered_user['access_token']}"}
