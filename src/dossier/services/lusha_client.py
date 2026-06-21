"""Cliente HTTP mínimo para Lusha API V3 (enriquecimiento de contactos)."""
from __future__ import annotations

import json
import os
from typing import Any

import requests

DEFAULT_BASE = "https://api.lusha.com"


class LushaApiError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"Lusha HTTP {status}: {body[:500]}")
        self.status = status
        self.body = body


class LushaClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: int = 90,
    ):
        key = (api_key or os.getenv("LUSHA_API_KEY") or "").strip()
        if not key:
            raise ValueError(
                "Falta LUSHA_API_KEY en el entorno (.env). "
                "Configura la clave de Lusha para búsquedas de personas."
            )
        self._api_key = key
        self._base = (base_url or os.getenv("LUSHA_API_URL") or DEFAULT_BASE).rstrip("/")
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {
            "api_key": self._api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def post(self, path: str, body: dict[str, Any]) -> Any:
        if not path.startswith("/"):
            path = "/" + path
        url = f"{self._base}{path}"
        r = requests.post(url, headers=self._headers(), json=body, timeout=self._timeout)
        text = r.text or ""
        if not r.ok:
            raise LushaApiError(r.status_code, text)
        if not text.strip():
            return None
        return r.json()

    def search_and_enrich_contacts(
        self,
        contacts: list[dict[str, Any]],
        *,
        reveal: list[str] | None = None,
        include_partial_profiles: bool = True,
    ) -> Any:
        """
        ``POST /v3/contacts/search-and-enrich`` — busca por identificadores y opcionalmente revela PII.

        ``reveal``: p. ej. ``["emails", "phones"]`` (consume créditos Lusha).
        """
        payload: dict[str, Any] = {
            "contacts": contacts,
            "options": {"includePartialProfiles": include_partial_profiles},
        }
        if reveal:
            payload["reveal"] = reveal
        data = self.post("/v3/contacts/search-and-enrich", payload)
        if isinstance(data, dict):
            results = data.get("results")
            if isinstance(results, list) and len(results) == 0:
                return {**data, "_lushaEmptySearch": True}
        return data
