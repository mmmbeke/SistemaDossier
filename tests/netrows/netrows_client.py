"""
Cliente mínimo HTTP para la API REST de Netrows (pruebas locales).

Referencia de rutas y auth alineada con el paquete público `@netrows/mcp-server`
(base URL por defecto `https://www.netrows.com/api/v1`, cabecera `Authorization: Bearer <key>`).

No incluyas API keys en este directorio: usa variables de entorno (ver README).
"""
from __future__ import annotations

import json
import os
from typing import Any
from urllib.parse import urlencode

import requests

DEFAULT_BASE = "https://www.netrows.com/api/v1"


class NetrowsApiError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"Netrows HTTP {status}: {body[:500]}")
        self.status = status
        self.body = body


class NetrowsClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: int = 90,
    ):
        key = (api_key or os.getenv("NETROWS_API_KEY") or "").strip()
        if not key:
            raise ValueError(
                "Falta NETROWS_API_KEY (argumento o variable de entorno). "
                "Añádela al `.env` en la raíz del repo."
            )
        self._api_key = key
        self._base = (base_url or os.getenv("NETROWS_API_URL") or DEFAULT_BASE).rstrip("/")
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """GET JSON. `path` debe empezar por `/` (ej. `/locations/search`)."""
        if not path.startswith("/"):
            path = "/" + path
        url = f"{self._base}{path}"
        if params:
            # Filtra None y convierte bool a string lower para hasJobs etc.
            clean: dict[str, str] = {}
            for k, v in params.items():
                if v is None:
                    continue
                if isinstance(v, bool):
                    clean[k] = "true" if v else "false"
                else:
                    clean[k] = str(v)
            q = urlencode(clean)
            url = f"{url}?{q}"
        r = requests.get(url, headers=self._headers(), timeout=self._timeout)
        text = r.text
        if not r.ok:
            # La API de Netrows suele responder 404 + NOT_FOUND cuando no hay coincidencias
            # en /people/search (no un 200 con lista vacía).
            if r.status_code == 404 and path.rstrip("/").endswith("/people/search"):
                try:
                    err = json.loads(text)
                except json.JSONDecodeError:
                    err = {}
                if err.get("code") == "NOT_FOUND":
                    return {
                        "_netrowsEmptySearch": True,
                        "message": err.get("message"),
                        "code": err.get("code"),
                    }
            raise NetrowsApiError(r.status_code, text)
        if not text.strip():
            return None
        return r.json()
