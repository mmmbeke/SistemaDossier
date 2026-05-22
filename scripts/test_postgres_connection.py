"""
Test breve: ¿la app ve la misma PostgreSQL que tú y pueden leerse/escribirse datos?

Uso (desde la raíz del repo):

    python scripts/test_postgres_connection.py

Opcional — con la API ya en marcha (`python main.py`), prueba un registro de prueba vía HTTP:

    python scripts/test_postgres_connection.py --http

No subas este script con secretos; solo usa tu `.env` local.
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

# Raíz del repo / src en el path (igual que otros scripts)
_ROOT = Path(__file__).resolve().parent.parent
_SRC = _ROOT / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from dossier.config import load_env  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Test conexión PostgreSQL (y opcional HTTP register).")
    parser.add_argument(
        "--http",
        action="store_true",
        help="Además, POST /auth/register contra http://127.0.0.1:8000 (requiere API en marcha).",
    )
    parser.add_argument(
        "--api-url",
        default="http://127.0.0.1:8000",
        help="Base URL de FastAPI (solo con --http).",
    )
    args = parser.parse_args()

    load_env()

    from sqlalchemy import text

    from dossier.db import is_database_configured
    from dossier.db.connection import get_engine
    from dossier.db.settings import build_database_url

    print("=== Test PostgreSQL (desde .env) ===\n")

    if not is_database_configured():
        print("ERROR: No hay DATABASE_URL ni POSTGRES_HOST+POSTGRES_DB en .env")
        return 1

    url = build_database_url()
    # No imprimir contraseña: solo host/db aproximados
    if url:
        safe = url.split("@")[-1] if "@" in url else url[:60]
        print(f"URL (cola): ...@{safe}\n")
    else:
        print("(URL no construida)\n")

    try:
        engine = get_engine()
    except Exception as e:
        print(f"ERROR al crear motor / conectar: {e}")
        return 1

    with engine.connect() as conn:
        one = conn.execute(text("SELECT 1 AS ok")).scalar_one()
        print(f"SELECT 1 -> {one}  (conexion OK)\n")

        for table in ("users", "organizations", "org_memberships"):
            try:
                n = conn.execute(text(f"SELECT COUNT(*)::bigint FROM {table}")).scalar_one()
                print(f"  {table}: {n} filas")
            except Exception as e:
                print(f"  {table}: ERROR ({e})")

    print("\n=== Resumen ===")
    print("Si los COUNT coinciden con lo que ves en pgAdmin en ESTA misma base, la API usa el servidor correcto.")
    print("Si users=0 tras registrarte en la web, el registro falla o apunta a otra base.\n")

    if args.http:
        print("=== Test HTTP POST /auth/register ===\n")
        try:
            import urllib.error
            import urllib.request
        except ImportError:
            print("urllib no disponible (raro). Salto test HTTP.")
            return 0

        email = f"ping-{uuid.uuid4().hex[:12]}@test.local"
        body = json.dumps(
            {
                "email": email,
                "password": "TestPass123!",
                "full_name": "Ping Test",
                "company_name": f"Org Ping {uuid.uuid4().hex[:8]}",
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            f"{args.api_url.rstrip('/')}/auth/register",
            data=body,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                status = resp.status
                raw = resp.read().decode("utf-8")
                data = json.loads(raw)
            print(f"HTTP {status} OK")
            print(f"  Usuario creado (email): {data.get('user', {}).get('email', email)}")
            print(f"  organization_id: {data.get('user', {}).get('organization_id', '?')}")
            print("\nVuelve a ejecutar el SELECT COUNT en `users` en pgAdmin; debería aumentar en 1.")
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            print(f"HTTP ERROR {e.code}: {err[:500]}")
            return 1
        except urllib.error.URLError as e:
            print(f"No se pudo conectar a {args.api_url}: {e}")
            print("¿Está la API en marcha? (python main.py)")
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
