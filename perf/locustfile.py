"""Prueba de estres (lectura) - Locust.

Uso:
  locust -f perf/locustfile.py --host=http://127.0.0.1:8000 --token=TU_JWT
  Abre http://localhost:8089 para la UI web.
"""
from __future__ import annotations

import os

from locust import HttpUser, between, events, task


@events.init_command_line_parser.add_listener
def _add_token_arg(parser) -> None:
    parser.add_argument(
        "--token",
        type=str,
        env_var="API_TOKEN",
        default="",
        help="JWT Bearer para rutas autenticadas",
    )


@events.test_start.add_listener
def _on_test_start(environment, **kwargs) -> None:
    token = getattr(environment.parsed_options, "token", "") or os.getenv("API_TOKEN", "")
    if not token:
        print("AVISO: sin --token/API_TOKEN; solo se probará /health.")


class DossierReadUser(HttpUser):
    wait_time = between(0.5, 2)

    def on_start(self) -> None:
        token = getattr(self.environment.parsed_options, "token", "") or os.getenv("API_TOKEN", "")
        self._has_token = bool(token)
        if token:
            self.client.headers.update({"Authorization": f"Bearer {token}"})

    @task(5)
    def health(self) -> None:
        self.client.get("/health", name="/health")

    @task(10)
    def list_dossiers(self) -> None:
        if not self._has_token:
            return
        self.client.get("/dossiers?limit=20", name="/dossiers")

    @task(3)
    def list_jobs(self) -> None:
        if not self._has_token:
            return
        self.client.get("/dossier-generation-jobs?active_only=true", name="/dossier-generation-jobs")
