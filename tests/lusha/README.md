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

## Referencia API

- Base: `https://api.lusha.com`
- Auth: cabecera `api_key: <LUSHA_API_KEY>`
- Endpoint usado en producción: `POST /v3/contacts/search-and-enrich`
- Documentación: [docs.lusha.com](https://docs.lusha.com/guides)
