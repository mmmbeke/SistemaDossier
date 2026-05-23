"""
Elimina de PostgreSQL solo datos de desarrollo creados por scripts del repo:

- Usuario del seed: `prueba-seed@localhost.test` (ver `seed_test_data.py`).
- Usuarios de prueba HTTP: emails terminados en `@test.local` (ver `test_postgres_connection.py --http`).

No borra cuentas corporativas normales. Usa la misma conexion que `seed_test_data.py` (tu `.env`).

Uso (raiz del repo):

    # Muestra que se borraria (no modifica la BD)
    python scripts/cleanup_dev_test_data.py

    # Aplica borrado y organizaciones huerfanas sin membresias
    python scripts/cleanup_dev_test_data.py --apply
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
_SRC = _ROOT / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from dossier.config import load_env  # noqa: E402

SEED_EMAIL = "prueba-seed@localhost.test"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Quita usuarios de prueba/seed de PostgreSQL (misma BD que .env)."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Ejecuta el borrado. Sin este flag solo se lista lo que se borraria.",
    )
    args = parser.parse_args()

    load_env()

    from sqlalchemy import delete, exists, func, or_, select
    from sqlalchemy.orm import sessionmaker

    from dossier.db import is_database_configured
    from dossier.db.connection import get_engine
    from dossier.db.models import Organization, OrgMembership, User

    print("=== Limpieza datos dev (PostgreSQL) ===\n")

    if not is_database_configured():
        print("ERROR: PostgreSQL no configurado en .env (DATABASE_URL o POSTGRES_*).")
        return 1

    engine = get_engine()
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = SessionLocal()
    try:
        q = select(User).where(
            or_(
                User.email == SEED_EMAIL,
                func.lower(User.email).like("%@test.local"),
            )
        )
        users = list(db.scalars(q).all())

        if not users:
            print("No hay usuarios de prueba/seed que coincidan (seed o *@test.local).")
            print("Nada que borrar.\n")
            return 0

        print("Usuarios a eliminar:")
        for u in users:
            print(f"  - {u.email}  (id={u.id})")

        if not args.apply:
            print("\nModo simulacion (--apply no usado). Ejecuta de nuevo con --apply para borrar.\n")
            return 0

        for u in users:
            db.delete(u)
        db.flush()

        # Organizaciones sin ninguna membresia (p. ej. la org solo del seed)
        orphan_org = delete(Organization).where(
            ~exists().where(OrgMembership.organization_id == Organization.id)
        )
        result = db.execute(orphan_org)
        n_orgs = result.rowcount if result.rowcount is not None else 0

        db.commit()
        print(f"\nOK: eliminados {len(users)} usuario(s) y {n_orgs} organizacion(es) huerfana(s).\n")
        return 0
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        print(
            "Si falla por claves foraneas (p. ej. dossiers ligados a ese usuario), "
            "borra o reasigna esas filas en pgAdmin y vuelve a ejecutar.\n"
        )
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
