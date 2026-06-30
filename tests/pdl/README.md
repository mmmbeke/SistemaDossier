# People Data Labs (PDL) — integración dossier persona

Documentación oficial: https://docs.peopledatalabs.com/

Índice completo: https://docs.peopledatalabs.com/llms.txt

## Resumen API (v5)

| Producto | Método | Endpoint | Uso en Sistema Dossier |
|----------|--------|----------|------------------------|
| Person Enrichment | GET / POST | `/v5/person/enrich` | **Principal** — match 1:1 por email, LinkedIn, nombre+empresa |
| Person Search | POST | `/v5/person/search` | **Fallback** — SQL sobre dataset global |
| Company Enrich | GET | `/v5/company/enrich` | No cableado (solo persona) |
| Person Identify | POST | `/v5/person/identify` | Alternativa multi-candidato (no usada aún) |

### Autenticación

- Cabecera: `X-Api-Key: <PDL_API_KEY>`
- Alternativa: query `api_key=` (no recomendado)
- Docs: https://docs.peopledatalabs.com/docs/authentication

### Person Enrichment

- URL: `https://api.peopledatalabs.com/v5/person/enrich`
- **200** = match (cobra crédito)
- **404** = sin match (no es error de clave)
- **401** = clave inválida | **402** = créditos agotados | **429** = rate limit

Parámetros útiles (todos opcionales; cuantos más, mejor el match):

- `email`, `profile` (LinkedIn), `phone`, `pdl_id`
- `first_name` + `last_name` + (`company` | `location` | `country` | …)
- `name` (nombre completo)
- `min_likelihood` (default en app: `2`, env `PDL_MIN_LIKELIHOOD`)

Mínimo para match (docs):

```
profile OR email OR phone OR ( (first_name AND last_name) AND (locality OR region OR company OR location …) )
```

Referencia: https://docs.peopledatalabs.com/docs/reference-person-enrichment-api

### Person Search (fallback)

- URL: `https://api.peopledatalabs.com/v5/person/search`
- Body JSON: `{ "sql": "SELECT * FROM person WHERE …", "size": 5 }`
- Cobra **por registro** en `data[]`
- Rate limit default: **10 req/min**

Referencia: https://docs.peopledatalabs.com/docs/reference-person-search-api

### Campos clave en respuesta (`data`)

- `id`, `full_name`, `linkedin_url`
- `job_title`, `job_company_name`
- `work_email`, `emails[]`, `phone_numbers[]`
- `location_name`, `location_country`, `location_locality`
- `experience[]`, `education[]`, `skills[]`

Schema: https://docs.peopledatalabs.com/docs/fields

## Configuración en Sistema Dossier

En `.env`:

```env
PDL_API_KEY=tu_clave_aqui
# PEOPLE_DATA_LABS_API_KEY=   # alias aceptado
# PDL_API_URL=https://api.peopledatalabs.com
# PDL_MIN_LIKELIHOOD=2

# Opcional: PDL es el proveedor por defecto (no hace falta definirlo)
# PERSON_RESEARCH_PROVIDER=pdl
```

Dashboard PDL → **API Keys**: https://www.peopledatalabs.com/

## Endpoints de la app

- `GET /integrations/pdl/health` — diagnóstico de clave (sin JWT)
- `POST /dossiers/person/research` con `"research_source": "pdl"`

## Smoke test

```powershell
$env:PYTHONPATH="src"
python tests/pdl/smoke_enrich.py --health
python tests/pdl/smoke_enrich.py --profile "https://www.linkedin.com/in/seanthorne"
python tests/pdl/smoke_enrich.py --email "nombre@empresa.com"
python tests/pdl/smoke_enrich.py --first-name "John" --last-name "Doe" --company "Acme"
```

## Flujo interno

1. Estrategias `person/enrich` (email → LinkedIn → nombre+empresa → nombre+ubicación)
2. Si no hay match → `person/search` SQL con nombre + empresa + dominio email
3. Hechos verificados → prompt DeepSeek → informe dossier

Archivos:

- `src/dossier/services/pdl_client.py`
- `src/dossier/services/pdl_search.py`
- `src/dossier/services/pdl_research.py`
- `src/dossier/services/person_research_service.py` (rama `research_source=pdl`)

## Errores

https://docs.peopledatalabs.com/docs/errors

| HTTP | Significado |
|------|-------------|
| 404 | Sin perfil (en enrich) |
| 401 | API key inválida |
| 402 | Sin créditos |
| 429 | Rate limit |
