# Estructura del repositorio SistemaDossier

Objetivo: **código Python bajo `src/dossier/`**, raíz solo con configuración, datos y arranque.

```
SistemaDossier/
├── main.py                 # Arranque: carga .env y uvicorn (importa dossier.api.app)
├── requirements.txt
├── .env                    # Local (no git) — plantilla: .env.example
├── README.md
│
├── src/dossier/            # Paquete principal
│   ├── api/                # FastAPI: auth, dossiers, calendario, admin, integraciones
│   ├── services/           # Lógica de negocio (calendario, dossiers, personas, orgs)
│   ├── graphs/             # LangGraph corporativo (UK/US → síntesis)
│   ├── db/                 # SQLAlchemy + Migracion.md (DDL)
│   ├── schemas/            # Pydantic
│   ├── security/           # JWT, bcrypt, RBAC
│   ├── billing/            # Planes, créditos, entitlements
│   ├── cache/              # Redis (dossiers corporativos/persona)
│   ├── gemini/             # Shim de compatibilidad → llm/ (DeepSeek)
│   ├── llm/                # Cliente DeepSeek y utilidades de informes
│   ├── companies_house/    # CLI UK
│   ├── sec_edgar/          # CLI USA (SEC)
│   └── config.py           # Rutas del proyecto, .env, carpeta data/
│
├── scripts/                # CLIs (companies_house.py, sec_edgar.py) y utilidades de migración
├── data/                   # Salidas JSON / análisis (gitignored parcialmente)
├── docs/                   # Guías de despliegue, SQL, auth, calendario
├── frontend-react/         # Dashboard Next.js
└── tests/                  # Pruebas pytest (desarrollo)
```

## Cómo se importa

- Desde la raíz: `python main.py` añade `src/` a `sys.path`.
- Alternativa: `$env:PYTHONPATH="src"` y `uvicorn dossier.api.app:app --reload`.

## Despliegue

| Pieza | Documentación |
|-------|----------------|
| API (Render) | [render-deploy.md](render-deploy.md) |
| Frontend (Vercel) | [vercel-frontend.md](vercel-frontend.md) |
| PostgreSQL | [postgresql.md](postgresql.md) |
| Auth dashboard | [auth-app.md](auth-app.md) |
| Calendario OAuth | [calendario-oauth-operaciones.md](calendario-oauth-operaciones.md) |

## Esquema de base de datos

1. Ejecutar `docs/sql/schema_project_dossier.sql` (equivalente a `src/dossier/db/Migracion.md`).
2. Aplicar parches incrementales: `docs/sql/patch_after_migracion_v1.sql`.

Al arrancar, `schema_patches.py` aplica parches menores automáticamente si faltan columnas.
