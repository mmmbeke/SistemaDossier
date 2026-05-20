# Sistema Dossier

Backend **FastAPI**, consultas **Companies House** y **SEC EDGAR**, análisis con **Gemini**, calendario **Microsoft Graph** y conexión opcional a **PostgreSQL**.

## Estructura (resumen)

| Ubicación | Contenido |
|-----------|-----------|
| **`main.py`** | Arranque del servidor (`uvicorn`) |
| **`src/dossier/api/app.py`** | Rutas HTTP (FastAPI) |
| **`src/dossier/services/`** | Calendario Graph + dossiers OpenAI |
| **`src/dossier/db/`** | PostgreSQL |
| **`src/dossier/gemini/`** | Análisis de archivos con Gemini |
| **`src/dossier/companies_house/`** | CLI Reino Unido |
| **`src/dossier/sec_edgar/`** | CLI Estados Unidos |
| **`scripts/`** | Entradas `companies_house.py`, `sec_edgar.py` |
| **`data/`** | JSON y textos generados |
| **`docs/`** | Guías (`estructura.md`, `postgresql.md`, `sec_edgar.md`) |
| **`Frontend/`** | UI estática |

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
| `GEMINI_API_KEY` | Análisis Gemini en CLIs |
| `OPENAI_API_KEY` | Dossiers en `/generar-dossier` y calendario |
| `MICROSOFT_*` | Login Outlook / Graph |
| `DATABASE_URL` o `POSTGRES_*` | Base de datos (opcional) |

Más: [.env.example](.env.example) y [docs/postgresql.md](docs/postgresql.md).
