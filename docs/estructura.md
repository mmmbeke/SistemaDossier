# Estructura del repositorio SistemaDossier

Objetivo: **código Python bajo `src/dossier/`**, raíz solo con configuración, datos y arranque.

```
SistemaDossier/
├── main.py                 # Arranque: carga .env y uvicorn (importa dossier.api.app)
├── requirements.txt
├── .env                    # Local (no git)
├── .env.example
├── README.md
│
├── src/dossier/            # Paquete principal
│   ├── api/
│   │   ├── app.py          # FastAPI: CORS, lifespan, rutas Microsoft, calendario, BD
│   │   ├── auth_routes.py  # Auth app: register/login/me (tablas migradas + JWT)
│   │   └── dossier_routes.py  # Dossiers PostgreSQL: listado, detalle, borrado, corporativo
│   ├── services/
│   │   ├── graph_calendar.py   # Microsoft Graph (Outlook)
│   │   └── openai_dossier.py   # Dossiers con OpenAI
│   ├── db/                 # SQLAlchemy: `Migracion.md` (DDL), modelos alineados al schema
│   ├── schemas/            # Pydantic (p. ej. cuerpos de auth)
│   ├── security/           # Hash bcrypt + JWT para cuentas del dashboard
│   ├── gemini/             # Análisis de documentos con Gemini
│   ├── companies_house/    # CLI UK
│   ├── sec_edgar/          # CLI USA (SEC)
│   └── config.py           # Rutas del proyecto, .env, carpeta data/
│
├── scripts/                # CLIs (Companies House, SEC)
├── data/                   # Salidas JSON / análisis (gitignored parcialmente)
├── docs/                   # Documentación markdown (auth-app, postgresql, …)
├── frontend-react/         # Dashboard Next.js (login/registro → API FastAPI)
├── Frontend/               # Interfaz estática (HTML/JS/CSS)
│
├── Company_house_API/      # Puntero de compatibilidad → scripts + src
└── Sec_Edgar_Api/
```

## Cómo se importa

- Desde la raíz: `python main.py` añade `src/` a `sys.path`.
- Desde terminal alternativa: `set PYTHONPATH=src` y `uvicorn dossier.api.app:app --reload`.

## Qué no debería estar en la raíz

Módulos de negocio sueltos (`orchestrator.py`, `calendar_service.py`) se movieron a `src/dossier/services/`.

El shim `gemini_analyze.py` en la raíz solo reexporta `dossier.gemini` por compatibilidad con imports antiguos.
