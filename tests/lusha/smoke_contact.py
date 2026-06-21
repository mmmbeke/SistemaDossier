#!/usr/bin/env python3
"""Smoke test manual contra Lusha V3 (no pytest)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_SRC = _ROOT / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from dossier.services.lusha_client import LushaApiError, LushaClient  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test Lusha search-and-enrich")
    parser.add_argument("--first-name", required=True)
    parser.add_argument("--last-name", required=True)
    parser.add_argument("--company", default="")
    parser.add_argument(
        "--reveal",
        action="store_true",
        help="Revelar emails y teléfonos (consume créditos Lusha)",
    )
    args = parser.parse_args()

    contact: dict[str, str] = {
        "firstName": args.first_name.strip(),
        "lastName": args.last_name.strip(),
    }
    if args.company.strip():
        contact["companyName"] = args.company.strip()

    reveal = ["emails", "phones"] if args.reveal else None

    try:
        client = LushaClient()
        data = client.search_and_enrich_contacts([contact], reveal=reveal)
    except ValueError as e:
        print(f"Config: {e}", file=sys.stderr)
        return 2
    except LushaApiError as e:
        print(f"HTTP {e.status}: {e.body[:800]}", file=sys.stderr)
        return 1

    print(json.dumps(data, ensure_ascii=False, indent=2))
    results = (data or {}).get("results") if isinstance(data, dict) else None
    n = len(results) if isinstance(results, list) else 0
    print(f"\n--- contactos devueltos: {n} ---", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
