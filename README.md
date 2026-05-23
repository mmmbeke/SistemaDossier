# Sistema Dossier

Backend **FastAPI**, consultas **Companies House** y **SEC EDGAR**, análisis con **Gemini**, calendario **Microsoft Graph** y conexión opcional a **PostgreSQL**.

## Estructura (resumen)

| Ubicación | Contenido |
|-----------|-----------|
| **`main.py`** | Arranque del servidor (`uvicorn`) |
| **`src/dossier/api/app.py`** | Rutas HTTP (FastAPI) |
| **`src/dossier/services/`** | Calendario Graph + dossier ejecutivo (LangGraph + Gemini) |
| **`src/dossier/graphs/`** | Grafo LangGraph (agentes UK/US en paralelo → síntesis) |
| **`src/dossier/db/`** | PostgreSQL |
| **`src/dossier/gemini/`** | Análisis de archivos con Gemini |
| **`src/dossier/companies_house/`** | CLI Reino Unido |
| **`src/dossier/sec_edgar/`** | CLI Estados Unidos |
| **`scripts/`** | Entradas `companies_house.py`, `sec_edgar.py` |
| **`data/`** | JSON y textos generados |
| **`docs/`** | Guías (`estructura.md`, `postgresql.md`, `sec_edgar.md`) |
| **`frontend-react/`** | Dashboard Next.js (npm; ver su `README.md`) |

Detalle: [docs/estructura.md](docs/estructura.md).

## Configuración

```powershell
cd SistemaDossier
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

## Arranque de la API

```powershell
python main.py
```

O:

```powershell
$env:PYTHONPATH="src"
uvicorn dossier.api.app:app --reload
```

## CLIs (registros UK / USA)

```powershell
python scripts/companies_house.py
python scripts/sec_edgar.py
```

## Variables de entorno (`.env`)

| Variable | Uso |
|----------|-----|
| `COMPANIES_HOUSE_API_KEY` | API Companies House |
| `GEMINI_API_KEY` | Síntesis del dossier (LangGraph) y análisis de archivos en CLIs |
| `OPENAI_API_KEY` | Solo si activas `DOSSIER_LEGACY_OPENAI=1` (dossier sin LangGraph) |
| `MICROSOFT_*` | Login Outlook / Graph |
| `DATABASE_URL` o `POSTGRES_*` | Base de datos (opcional) |
| `JWT_SECRET` | Firma de JWT para `/auth/*` (necesario para registro/login del dashboard) |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Caducidad del token (por defecto 7 días) |
| `CORS_ORIGINS` | Orígenes permitidos para el Next.js (lista separada por comas) |
| `DATABASE_AUTO_CREATE_TABLES` | `0` para no ejecutar `create_all` al arrancar (si ya aplicaste el SQL de migración) |

Más: [.env.example](.env.example) y [docs/postgresql.md](docs/postgresql.md).

## Auth del dashboard (email + contraseña) y frontend

El backend usa las tablas del **schema migrado** (`organizations`, `users`, `org_memberships`, `dossiers`, …). Aplica primero **[docs/sql/schema_project_dossier.sql](docs/sql/schema_project_dossier.sql)** en PostgreSQL (es el mismo contenido que `src/dossier/db/Migracion.md`).

Endpoints principales: **`POST /auth/register`**, **`POST /auth/login`**, **`GET /auth/me`**, **`GET /dossiers`**, **`GET /dossiers/{id}`** (los dossiers requieren JWT con `org_id`).

1. En `.env` (raíz): `POSTGRES_*` o `DATABASE_URL`, **`JWT_SECRET`**, y opcionalmente **`DATABASE_AUTO_CREATE_TABLES=0`** si ya creaste el esquema con el SQL.
2. Opcional: **`CORS_ORIGINS`** con la URL del Next.js (por defecto `http://localhost:3000` y `http://127.0.0.1:3000`).
3. En `frontend-react/`: copia [frontend-react/.env.local.example](frontend-react/.env.local.example) a **`.env.local`** y ajusta `NEXT_PUBLIC_API_URL` si el API no está en `127.0.0.1:8000`.
4. Arranca API (`python main.py`) y el frontend (`npm run dev`); registro e inicio de sesión llaman al backend y guardan el token en `localStorage` o `sessionStorage`.

Detalle: [docs/auth-app.md](docs/auth-app.md).
