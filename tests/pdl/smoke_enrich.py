#!/usr/bin/env python3
"""Smoke test manual contra People Data Labs (no pytest)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_SRC = _ROOT / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from dossier.config import load_env  # noqa: E402
from dossier.services.pdl_client import PdlApiError, PdlClient, pdl_error_message  # noqa: E402

load_env()


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test PDL person/enrich")
    parser.add_argument("--email", default="")
    parser.add_argument("--profile", default="", help="LinkedIn URL")
    parser.add_argument("--first-name", default="")
    parser.add_argument("--last-name", default="")
    parser.add_argument("--company", default="")
    parser.add_argument(
        "--health",
        action="store_true",
        help="Comprobar PDL_API_KEY y acceso API",
    )
    args = parser.parse_args()

    try:
        client = PdlClient()
    except ValueError as e:
        print(f"Config: {e}", file=sys.stderr)
        return 2

    if args.health:
        access = client.check_access()
        print(json.dumps(access, ensure_ascii=False, indent=2))
        if access.get("enrich_access") or access.get("search_access"):
            print("\n--- OK: API PDL accesible ---", file=sys.stderr)
            return 0
        print("\n--- Error de acceso PDL ---", file=sys.stderr)
        return 1

    params: dict[str, str] = {}
    if args.email.strip():
        params["email"] = args.email.strip()
    if args.profile.strip():
        params["profile"] = args.profile.strip()
    if args.first_name.strip() and args.last_name.strip():
        params["first_name"] = args.first_name.strip()
        params["last_name"] = args.last_name.strip()
    if args.company.strip():
        params["company"] = args.company.strip()

    if not params:
        print("Indica --email, --profile o --first-name + --last-name (+ --company).", file=sys.stderr)
        return 2

    try:
        data = client.person_enrich(params)
    except PdlApiError as e:
        print(pdl_error_message(e), file=sys.stderr)
        print(f"HTTP {e.status}: {e.body[:800]}", file=sys.stderr)
        return 1

    if data is None:
        print("Sin match (404)", file=sys.stderr)
        return 0

    print(json.dumps(data, ensure_ascii=False, indent=2))
    person = data.get("data") if isinstance(data, dict) else None
    print(f"\n--- match: {'sí' if person else 'no'} ---", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
