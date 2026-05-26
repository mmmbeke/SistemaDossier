# Pruebas Netrows (API de datos profesionales / B2B)

Esta carpeta sirve para **validar la integración HTTP** con [Netrows](https://www.netrows.com/) antes de conectarla al backend del proyecto.

La **app productiva** expone `POST /dossiers/person/research` (JWT + misma `NETROWS_API_KEY` y `GEMINI_API_KEY` en `.env` de la raíz), consumida por el dashboard en **Personas (Netrows)** (`/dashboard/person-research`).

## Seguridad y RGPD

- **No subas la API key a Git.** Usa solo `.env` en la raíz del repo (ya está en `.gitignore`).
- Si una clave `pk_live_…` se ha compartido en texto claro (chat, ticket, etc.), **revócala y genera otra** en el panel de Netrows.
- Los datos que devuelve la API suelen ser **datos personales / profesionales**: debes tener **base legal** (RGPD/CCPA, etc.), minimización y políticas internas antes de usarlo en producción.

## Configuración

En la raíz `SistemaDossier/.env`:

```env
NETROWS_API_KEY=tu_clave_aqui
# Opcional (por defecto coincide con el SDK público de Netrows):
# NETROWS_API_URL=https://www.netrows.com/api/v1
```

## Dependencias

Usa el mismo entorno virtual del proyecto (`requirements.txt` ya incluye `requests` y `python-dotenv`).

## Ejecución (desde la raíz del repositorio)

```powershell
cd C:\Users\franc\Documents\SistemaDossier
python tests/netrows/smoke_tests.py locations --keyword "Madrid"
```

Más ejemplos:

```powershell
# Búsqueda de personas (parámetros opcionales; combina según la doc. de Netrows)
python tests/netrows/smoke_tests.py people --keyword-title "Engineer" --geo "Spain" --start 0

# Búsqueda de empresas (la API exige los 6 filtros; ejemplo con España y tamaño C)
python tests/netrows/smoke_tests.py companies --keyword "software" --locations 105646813 --sizes C --no-jobs --industries "" --page 1

# Empleos
python tests/netrows/smoke_tests.py jobs --keywords "python" --location-id 103644278 --start 0

# Nombre + país → resultados de búsqueda y, si el JSON trae URLs de perfil, ficha detallada
python tests/netrows/smoke_tests.py person --name "María García López" --country "Spain"
python tests/netrows/smoke_tests.py person --name "Juan Pérez" --country "Spain" --max-profiles 2 --include-posts
```

Netrows está orientado a **datos profesionales / B2B** (experiencia, empresa, educación, etc.). No promete un “informe político” ni datos fuera de lo que la API devuelva; el alcance depende de las fuentes públicas que indexe el proveedor.

## Archivos

| Archivo | Descripción |
|--------|-------------|
| `netrows_client.py` | Cliente GET con `Authorization: Bearer` y manejo de errores. |
| `person_lookup.py` | Heurística nombre→`first`/`last`/`keywords` y extracción de URLs de perfil desde el JSON. |
| `smoke_tests.py` | CLI con subcomandos `locations`, `people`, `person`, `companies`, `jobs`. |

## Referencia técnica

Rutas y cabeceras alineadas con el código publicado en `@netrows/mcp-server` (npm):

- Base: `https://www.netrows.com/api/v1`
- Auth: `Authorization: Bearer <NETROWS_API_KEY>`
- Ejemplos de rutas: `/locations/search`, `/people/search`, `/companies/search`, `/companies/details`, `/people/profile`, `/jobs/search`, …

La documentación oficial está en [netrows.com/docs](https://www.netrows.com/docs) (puede requerir sesión).
