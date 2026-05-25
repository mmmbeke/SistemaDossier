# Autenticación del dashboard (app)

Cuentas con **email y contraseña** guardadas en **PostgreSQL**, sesión con **JWT** (HS256). Es independiente del flujo **Microsoft** (`/login-microsoft`) usado para el calendario Graph.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/register` | Crea `organizations` + `users` + `org_memberships`, devuelve JWT y perfil. |
| `POST` | `/auth/login` | Valida credenciales; JWT incluye `org_id` de la organización primaria. |
| `GET` | `/auth/me` | Cabecera `Authorization: Bearer <token>`; devuelve perfil + `organization_id` + `role`. |
| `GET` | `/dossiers` | Lista dossiers de la org del JWT (tabla `dossiers`). |
| `GET` | `/dossiers/{id}` | Detalle de un dossier de tu organización. |
| `DELETE` | `/dossiers/{id}` | Elimina un dossier de tu organización (respuesta `204 No Content`). |

Cuerpos JSON esperados:

- **register:** `{ "email", "password", "full_name", "company_name" }`
- **login:** `{ "email", "password" }`

## Variables de entorno

- **`JWT_SECRET`**: obligatoria para firmar tokens (mínimo 16 caracteres; en producción, 32+ aleatorios).
- **`JWT_ACCESS_TOKEN_EXPIRE_MINUTES`**: opcional (por defecto `10080` = 7 días).
- **`ORG_SIGNUP_CREDITS`**: opcional — créditos iniciales de la **organización** al completar `POST /auth/register` (entero ≥ 0; por defecto `500` en código si no está en `.env`).
- **`ORG_SIGNUP_CREDITS_MONTHLY_LIMIT`**: opcional — tope mensual de la org al registrarse; si no se define, coincide con `ORG_SIGNUP_CREDITS`.
- **`CORS_ORIGINS`**: orígenes del frontend (coma). Por defecto incluye `http://localhost:3000` y `http://127.0.0.1:3000`.
- PostgreSQL: **`DATABASE_URL`** o **`POSTGRES_*`** como en [postgresql.md](postgresql.md).

## Tablas y migración

El DDL oficial está en **`docs/sql/schema_project_dossier.sql`** (copia del archivo `src/dossier/db/Migracion.md`). Ejecútalo en tu instancia PostgreSQL antes de usar registro/login y dossiers.

Si en `.env` pones **`DATABASE_AUTO_CREATE_TABLES=0`**, la API **no** ejecutará `create_all` al arrancar (solo usará lo que ya creaste con el SQL).

Para producción se recomienda **Alembic** u otro sistema de migraciones versionadas.

## Frontend

En `frontend-react/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

El cliente guarda el JWT en `localStorage` (login con “recuérdame” o tras registro) o `sessionStorage` (login sin recordar).

## Si “no se guarda” en la base pero ves “email ya existe”

Ese mensaje (**HTTP 409**) solo puede salir si el backend **sí** consultó PostgreSQL y encontró el email en la tabla **`users`** (no `app_users`). Es decir: la petición del navegador **llegó** a la API y la API **vio** ese correo en la BD que tiene configurada en su `.env`.

Causas habituales de confusión:

1. **Primera petición ya creó el usuario** (respuesta 200) y la UI pareció fallar (redirección, pestaña de red, etc.); al reintentar obtienes 409.
2. **pgAdmin u otra herramienta** está conectada a **otro servidor o otra base** que la API. Compara con `GET /db/health`: si `postgresql` es `ok`, el JSON incluye `connection` (`host`, `port`, `database`) **sin contraseña**. Debe coincidir con la conexión donde miras las tablas.
3. **`NEXT_PUBLIC_API_URL`** del frontend no apunta al mismo backend que crees (otro puerto, contenedor, etc.). Tras cambiar `.env.local` hay que **reiniciar** `npm run dev`.

Errores **422** suelen ser validación (campos vacíos, contraseña corta, etc.); el mensaje en pantalla ahora incluye el nombre del campo cuando FastAPI lo devuelve en `loc`.

## Quitar solo datos de prueba del repo (seed / `@test.local`)

Los scripts **no crean otra base de datos**: escriben en la misma instancia que indica tu `.env`. Si ejecutaste `scripts/seed_test_data.py` o `scripts/test_postgres_connection.py --http`, puedes borrar esas filas con:

```bash
python scripts/cleanup_dev_test_data.py          # simulación
python scripts/cleanup_dev_test_data.py --apply  # borrado real
```
