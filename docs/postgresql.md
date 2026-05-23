# PostgreSQL en Sistema Dossier

Las credenciales **no van en el código** ni en el repositorio. Cada persona copia `.env.example` a `.env` y pone su propia base local (o remota).

## Variables

### Opción A — URL única

```
DATABASE_URL=postgresql+psycopg://usuario:contraseña@localhost:5432/nombre_bd
```

Si la contraseña tiene caracteres especiales, codifícala en la URL o usa la opción B.

### Opción B — Variables separadas

```
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=tu_clave_local
POSTGRES_DB=dossier
```

Opcional: `POSTGRES_POOL_SIZE`, `POSTGRES_MAX_OVERFLOW`.

## Código

| Módulo | Uso |
|--------|-----|
| `dossier.db.settings.build_database_url()` | Construye la URL desde el entorno |
| `dossier.db.is_database_configured()` | `True` si hay `DATABASE_URL` o `POSTGRES_HOST` + `POSTGRES_DB` |
| `dossier.db.get_engine()` | Motor SQLAlchemy (singleton) |
| `dossier.db.get_db` | Dependencia FastAPI `Depends(get_db)` |
| `dossier.db.dispose_engine()` | Cerrar pool (tests / shutdown) |

## Schema SQL (migración v1.0)

Ejecuta en PostgreSQL el script consolidado:

- **[sql/schema_project_dossier.sql](sql/schema_project_dossier.sql)** (mismo contenido que `src/dossier/db/Migracion.md`).

Incluye extensiones `uuid-ossp` y `pgcrypto`, tablas multi-tenant (`organizations`, `users`, `org_memberships`, `dossiers`, …) y triggers.

Si tu base se creó con una **versión antigua** del DDL y falla el `INSERT` en `dossiers` con error de FK en `credit_ledger`, aplica el parche idempotente:

- **[../scripts/fix_dossier_credit_triggers.sql](../scripts/fix_dossier_credit_triggers.sql)** (SQL puro; en Windows hace falta `psql` en el PATH), o bien
- **`python scripts/apply_fix_dossier_credit_triggers.py`** desde la raíz del repo (usa tu `.env` y `psycopg`, sin `psql`).

Tras aplicarlo, puedes desactivar la creación automática de tablas al arrancar la API con **`DATABASE_AUTO_CREATE_TABLES=0`** en `.env` (ver [auth-app.md](auth-app.md)).

## Comprobar conexión

Con el backend en marcha:

```http
GET /db/health
```

- Sin `.env` de base: `postgresql: not_configured`
- Con datos correctos: `postgresql: ok`
- Error de red o credenciales: `503` con `detail`

## Compartir el proyecto

1. Subes **solo** `.env.example` (sin secretos).
2. Cada colaborador crea su `.env` (git lo ignora).
3. Nadie depende de la contraseña de otro.

## Ejecutar módulos desde el IDE

Si usas **Run Python File** sobre `settings.py`, `connection.py` o `session.py`, el código añade automáticamente la carpeta `src/` al path cuando `dossier` no está instalado.

La forma recomendada sigue siendo:

```powershell
cd SistemaDossier
uvicorn main:app --reload
```

o, para una prueba rápida:

```powershell
$env:PYTHONPATH="src"
python -c "from dossier.db.settings import build_database_url; print(build_database_url())"
```
