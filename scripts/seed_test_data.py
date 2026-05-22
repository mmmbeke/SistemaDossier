"""
Inserta datos de prueba en PostgreSQL (organizations + users + org_memberships).

Sirve para comprobar que la escritura llega a la misma base que lee tu .env.

Uso (raiz del repo):

    python scripts/seed_test_data.py

Si el email de prueba ya existe, no duplica (sale mensaje y termina OK).

Para borrar solo estos datos de prueba de tu misma BD: `python scripts/cleanup_dev_test_data.py --apply`.

Login de prueba (tras insertar):
    email:    prueba-seed@localhost.test
    password: DemoPass123!

Solo para desarrollo local. No ejecutar en produccion con datos reales.
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
_SRC = _ROOT / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from dossier.config import load_env  # noqa: E402

SEED_EMAIL = "prueba-seed@localhost.test"
SEED_PASSWORD = "DemoPass123!"
SEED_ORG_NAME = "Empresa Seed Prueba"


def main() -> int:
    load_env()

    from sqlalchemy import select
    from sqlalchemy.orm import sessionmaker

    from dossier.db import is_database_configured
    from dossier.db.connection import get_engine
    from dossier.db.models import Organization, OrgMembership, User
    from dossier.security.passwords import hash_password

    print("=== Seed datos de prueba (PostgreSQL) ===\n")

    if not is_database_configured():
        print("ERROR: PostgreSQL no configurado en .env (DATABASE_URL o POSTGRES_*).")
        return 1

    engine = get_engine()
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = SessionLocal()
    try:
        existing = db.execute(select(User).where(User.email == SEED_EMAIL)).scalar_one_or_none()
        if existing is not None:
            print(f"Ya existe usuario con email: {SEED_EMAIL}")
            print("No se inserto nada nuevo. Puedes iniciar sesion con ese email y la clave de seed.")
            return 0

        slug = f"seed-org-{uuid.uuid4().hex[:12]}"
        org = Organization(name=SEED_ORG_NAME, slug=slug[:100])
        user = User(
            email=SEED_EMAIL,
            email_verified=False,
            password_hash=hash_password(SEED_PASSWORD),
            full_name="Usuario Seed",
            locale="es",
        )
        db.add(org)
        db.flush()
        db.add(user)
        db.flush()
        mem = OrgMembership(
            organization_id=org.id,
            user_id=user.id,
            role="admin",
            is_primary_org=True,
        )
        db.add(mem)
        db.commit()

        print("OK: filas insertadas.\n")
        print(f"  organizations.id = {org.id}")
        print(f"  users.id         = {user.id}")
        print(f"  slug             = {org.slug}\n")
        print("Credenciales para /login en el frontend o POST /auth/login:")
        print(f"  email:    {SEED_EMAIL}")
        print(f"  password: {SEED_PASSWORD}\n")
        print("En pgAdmin revisa tablas: users, organizations, org_memberships")
        print("(no uses app_users; el codigo nuevo escribe en users).\n")
        return 0
    except Exception as e:
        db.rollback()
        print(f"ERROR al insertar: {e}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
