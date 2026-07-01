# Pruebas — Sistema Dossier

Suite de QA, rendimiento y seguridad para la API FastAPI y el dashboard Next.js.

## Requisitos

```powershell
pip install -r requirements-dev.txt
cd frontend-react
npm install
npm run test:e2e:install   # solo la primera vez (Chromium)
```

Para pruebas de **integración** (registro, listado de dossiers): PostgreSQL y `JWT_SECRET` en `.env`.

## Ejecución rápida (Windows)

```powershell
# API: health + seguridad (sin tocar BD)
.\scripts\run-tests.ps1

# API + integración con PostgreSQL
.\scripts\run-tests.ps1 -Integration

# + Bandit, pip-audit, npm audit
.\scripts\run-tests.ps1 -Integration -Security

# + Locust/k6 (requiere API + JWT; niveles: smoke | medium | stress)
.\scripts\run-tests.ps1 -Perf -PerfLevel medium

# E2E Playwright + contrato OpenAPI (Schemathesis)
.\scripts\run-tests.ps1 -Integration -E2E -Contract

# Suite completa
.\scripts\run-tests.ps1 -Full
```

## Checklist (qué corre cada capa)

| Capa | Comando | Requisitos |
|------|---------|------------|
| pytest (23) | `.\scripts\run-tests.ps1 -Integration` | PostgreSQL + `.env` |
| Cobertura | `pytest tests/ --cov=dossier` | Igual que integración |
| Bandit / pip-audit / npm audit | `.\scripts\run-tests.ps1 -Security` | `requirements-dev.txt`, `npm install` |
| Schemathesis (5 GET) | `.\scripts\run-schemathesis.ps1` | API en marcha + `API_TOKEN` |
| Locust / k6 | `.\scripts\run-tests.ps1 -Perf -PerfLevel smoke` | API + JWT |
| Playwright E2E (8) | `cd frontend-react; npm run test:e2e` | API + `npm run dev` + credenciales |

**Un solo comando** (todo excepto E2E ya hecho manualmente):

```powershell
$env:TEST_LOGIN_EMAIL = "tu@correo.com"
$env:TEST_LOGIN_PASSWORD = "tu_contraseña"
.\scripts\run-tests.ps1 -Integration -Security -Contract -Perf -PerfLevel smoke
```

## pytest manual

```powershell
$env:PYTHONPATH = "src"
$env:DOSSIER_GENERATION_WORKER_ENABLED = "0"
$env:CALENDAR_AUTOMATION_ENABLED = "0"

# Sin integración (rápido, no requiere BD)
pytest tests/ -v -m "not integration"

# Todo incluyendo registro en PostgreSQL
pytest tests/ -v

# Solo seguridad
pytest tests/ -v -m security

# Con cobertura
pytest tests/ --cov=dossier --cov-report=term-missing
```

## Rendimiento y estrés

**Obtener el JWT (`API_TOKEN`)** — es el mismo token que usa el dashboard tras login:

```powershell
# Opción A: login automático (API en http://127.0.0.1:8000)
$env:TEST_LOGIN_EMAIL = "tu@correo.com"      # cuenta real de la app
$env:TEST_LOGIN_PASSWORD = "tu_contraseña"
$env:API_TOKEN = .\scripts\get-api-token.ps1

# Opción B: parámetros directos
$env:API_TOKEN = .\scripts\get-api-token.ps1 -Email tu@correo.com -Password "tu_clave"

# Opción C: desde el navegador (F12 → Application → localStorage → access_token)
# tras iniciar sesión en http://localhost:3000/login
```

`run-tests.ps1 -Perf` usa `TEST_LOGIN_EMAIL` / `TEST_LOGIN_PASSWORD` si `API_TOKEN` no está definido.

**k6** (instalar: `winget install GrafanaLabs.k6`):

```powershell
# API en marcha + JWT de un usuario real
k6 run -e API_TOKEN=tu_jwt perf/k6-read.js
k6 run -e API_TOKEN=tu_jwt -e VUS=20 -e DURATION=2m perf/k6-read.js
```

**Locust** (UI en http://localhost:8089):

```powershell
locust -f perf/locustfile.py --host=http://127.0.0.1:8000 --token=tu_jwt
```

> No ejecutes carga contra endpoints LLM (`/dossiers/person/research`, `/corporate/generate`) en producción: consumen créditos externos.

## Contrato OpenAPI (Schemathesis)

Fuzzing limitado a **5 rutas GET de lectura** (`/health`, `/db/health`, `/auth/me`, `/dossiers`, `/dossier-generation-jobs`). El script descarga `openapi.json`, filtra operaciones y escribe `perf/openapi-core-get.json` antes de ejecutar Schemathesis — evita falsos positivos en OAuth y calendario.

```powershell
$env:API_TOKEN = .\scripts\get-api-token.ps1   # o TEST_LOGIN_EMAIL/PASSWORD
.\scripts\run-schemathesis.ps1
```

Reinicia la API tras cambios en `responses` del esquema OpenAPI (`python main.py`).

Los tests autenticados (`auth-dashboard.spec.ts`) requieren `TEST_LOGIN_EMAIL` y `TEST_LOGIN_PASSWORD` en el entorno.

## CI (GitHub Actions)

En cada push/PR a `main`/`master`, el workflow `.github/workflows/pytest.yml` ejecuta la suite pytest con PostgreSQL 16.

## Seguridad

```powershell
bandit -r src/ -c bandit.yaml
pip-audit -r requirements.txt
cd frontend-react; npm audit
```

**OWASP ZAP** (opcional, con Docker):

```powershell
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://host.docker.internal:8000
```

## Playwright E2E

Primera vez (descarga Chromium en `frontend-react/.playwright-browsers/`):

```powershell
cd frontend-react
npm run test:e2e:install
```

Con API (`python main.py`) y frontend (`npm run dev`) en marcha:

```powershell
cd frontend-react
$env:TEST_LOGIN_EMAIL = "tu@correo.com"
$env:TEST_LOGIN_PASSWORD = "tu_contraseña"
$env:PLAYWRIGHT_SKIP_WEBSERVER = "1"   # si ya tienes npm run dev
$env:PLAYWRIGHT_API_URL = "http://127.0.0.1:8000"
npm run test:e2e
```

> Si ya estás dentro de `frontend-react`, no hagas `cd frontend-react` otra vez.

Reporte HTML: `frontend-react/playwright-report/`

## Estructura

```
tests/
  conftest.py              # fixtures (client, auth)
  api/
    test_health.py         # /health, /db/health
    test_auth_security.py  # 401, validación
    test_dossiers_integration.py  # registro + dossiers (integration)
perf/
  k6-read.js               # rendimiento lectura
  locustfile.py            # estrés lectura
  openapi-core-get.json    # generado por run_schemathesis.py (gitignored)
frontend-react/e2e/
  smoke.spec.ts            # login, redirect, API health
  auth-dashboard.spec.ts   # login real + dossiers + notificaciones
scripts/
  get-api-token.ps1
  run_schemathesis.py      # genera perf/openapi-core-get.json (5 GET)
  run-schemathesis.ps1     # fuzz OpenAPI filtrado (lectura core)
```
