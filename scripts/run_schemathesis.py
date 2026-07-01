"""Genera OpenAPI reducido y ejecuta Schemathesis solo en rutas GET core."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PERF = ROOT / "perf"
FILTERED_SPEC = PERF / "openapi-core-get.json"

# (method, path) exactos — lectura segura para fuzzing de contrato.
SAFE_OPERATIONS: frozenset[tuple[str, str]] = frozenset({
    ("get", "/health"),
    ("get", "/db/health"),
    ("get", "/auth/me"),
    ("get", "/dossiers"),
    ("get", "/dossier-generation-jobs"),
})


def _load_openapi(api_base: str) -> dict:
    url = f"{api_base.rstrip('/')}/openapi.json"
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.load(resp)


def _filter_spec(spec: dict) -> dict:
    paths: dict = {}
    for path, item in (spec.get("paths") or {}).items():
        if not isinstance(item, dict):
            continue
        kept = {
            method: op
            for method, op in item.items()
            if method.lower() in {"get", "post", "put", "patch", "delete", "head", "options"}
            and (method.lower(), path) in SAFE_OPERATIONS
        }
        if kept:
            paths[path] = kept
    out = dict(spec)
    out["paths"] = paths
    return out


def main() -> int:
    api_base = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")
    max_examples = os.getenv("SCHEMATHESIS_MAX_EXAMPLES", "10")
    token = os.getenv("API_TOKEN", "").strip()
    if not token:
        print("Falta API_TOKEN o ejecuta get-api-token.ps1 antes.", file=sys.stderr)
        return 1

    spec = _filter_spec(_load_openapi(api_base))
    op_count = sum(len(v) for v in spec.get("paths", {}).values())
    PERF.mkdir(parents=True, exist_ok=True)
    FILTERED_SPEC.write_text(json.dumps(spec, indent=2), encoding="utf-8")
    print(f"OpenAPI filtrado: {op_count} operaciones → {FILTERED_SPEC.relative_to(ROOT)}")

    cmd = [
        "schemathesis",
        "run",
        str(FILTERED_SPEC),
        "-u",
        api_base,
        "--header",
        f"Authorization: Bearer {token}",
        "--phases",
        "examples,fuzzing",
        "-n",
        max_examples,
        "--checks",
        "not_a_server_error,status_code_conformance,content_type_conformance",
        "--max-failures=5",
    ]
    print("Ejecutando:", " ".join(cmd[:6]), "...")
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
