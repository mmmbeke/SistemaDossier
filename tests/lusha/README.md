# Pruebas Lusha (API V3)

Validación manual de la integración con [Lusha](https://www.lusha.com/) antes de usar el dashboard.

La app productiva expone `POST /dossiers/person/research` con `research_source: "lusha"` (JWT + `LUSHA_API_KEY` + `GEMINI_API_KEY`).

## Configuración

En `.env` en la raíz del repo:

```env
LUSHA_API_KEY=tu_clave_aqui
# LUSHA_API_URL=https://api.lusha.com
```

Genera la clave en el panel de Lusha. No la commitees.

## Smoke test

Desde la raíz del repo (con `PYTHONPATH=src`):

```powershell
$env:PYTHONPATH="src"
python tests/lusha/smoke_contact.py --first-name "John" --last-name "Doe" --company "Acme"
```

Opcional: `--reveal` para pedir email/teléfono (consume créditos).

## Referencia API (v3)

- Base: `https://api.lusha.com`
- Auth: cabecera `api_key: <LUSHA_API_KEY>`
- Search: `POST /v3/contacts/search` — body `{ "contacts": [{ firstName, lastName, companyName | companyDomain | email | linkedinUrl }] }`
- Enrich: `POST /v3/contacts/enrich` — body `{ "ids": ["..."], "reveal": ["emails", "phones"] }` (no usar wrapper `contacts`)
- Search-and-enrich: `POST /v3/contacts/search-and-enrich`
- Documentación: [docs.lusha.com](https://docs.lusha.com/guides)

Variables útiles en `.env`:

```env
LUSHA_CALENDAR_REVEAL_CONTACTS=1   # email/teléfono al generar desde calendario (créditos Lusha)
```
