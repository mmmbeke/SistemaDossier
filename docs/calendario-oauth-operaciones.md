# Calendario Google / Outlook — definición BD y operaciones

Resumen alineado con vuestro producto: **solo lectura** de eventos futuros para que los agentes vean participantes, asunto y metadatos y generen el dossier. El usuario **elige Google o Microsoft** en la UI; la regla “un proveedor por usuario” se refleja en `UNIQUE (user_id, provider)` en `docs/calendar_integrations_oauth.sql`.

## 1. Base de datos

- Script recomendado: **`docs/calendar_integrations_oauth.sql`**.
- Columnas OAuth:
  - **`refresh_token_encrypted`** / **`access_token_encrypted`**: guardar cifrados con una clave de servidor (p. ej. variable `CALENDAR_TOKEN_ENCRYPTION_KEY`); en MVP algunos equipos guardan en claro — no recomendable en producción.
  - **`access_token_expires_at`**, **`granted_scopes`**: renovación y auditoría.
  - **`provider_subject`** / **`provider_email`**: quién autorizó (útil en soporte y desconexión).
  - **`revoked_at`**: desconectar sin borrar historial.

Si ya aplicaste la tabla desde `Migracion.md` **sin** estas columnas, usa el bloque `ALTER TABLE` comentado al final del `.sql`.

## 2. Microsoft Azure (Outlook) — qué configurar

1. **Azure Portal** → Microsoft Entra ID → **App registrations** → New registration.
2. **Redirect URI**: tipo **Web**, URL exacta de vuestro callback, p. ej.  
   `https://<tu-api-railway>/callback`  
   Debe coincidir **carácter a carácter** con `MICROSOFT_REDIRECT_URI`.
3. **Certificates & secrets** → New client secret → copiar a Railway como `MICROSOFT_CLIENT_SECRET`.
4. **API permissions** → Add → Microsoft Graph → **Delegated**: `Calendars.Read` y **`User.Read`** (perfil `/me`; ver `SCOPES` en `app.py`).
5. Grant admin consent solo si tu tenant lo exige (cuentas corporativas).
6. Railway (u otro host):
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`
   - `MICROSOFT_TENANT_ID` → `common` si aceptáis cuentas personales y work/school.
   - `MICROSOFT_REDIRECT_URI` → la misma URL registrada en Azure.
   - **`FRONTEND_URL`** (o `MICROSOFT_OAUTH_SUCCESS_URL`): base del front **sin** barra final, p. ej. `https://tu-app.vercel.app`. Tras OAuth con `state`, `/callback` redirige a  
     `{FRONTEND_URL}?calendar_microsoft=ok` o `...?calendar_microsoft=error&reason=...`.

**Flujo integrado (implementado):** `GET /integrations/microsoft/start` con JWT de la app (cabecera `Authorization: Bearer`). Parámetro **`as_json=true`** devuelve `{"authorize_url": "..."}` para SPAs; sin él, responde **302** a Microsoft. El `state` lleva `user_id` y `org_id`; en `/callback` se persisten tokens en **`calendar_integrations`** y se redirige al front.

**Pruebas sin usuario de la app:** `GET /login-microsoft` (sin `state`) sigue devolviendo JSON con `access_token` en `/callback` (legado).

**Lectura de eventos (Outlook) con JWT:** `GET /calendario/eventos`, `GET /calendario/diagnostico-microsoft` y `GET /calendario/generar-dossiers` usan **`Authorization: Bearer <JWT de la app>`**; el backend obtiene o renueva el token de Microsoft Graph desde **`calendar_integrations`** (refresh vía MSAL). El query **`?access_token=`** con un token de Graph sigue admitido solo como atajo de pruebas.

## 3. Google Cloud (Calendar) — qué configurar

1. **Google Cloud Console** → proyecto → **APIs & Services** → Enable **Google Calendar API**.
2. **OAuth consent screen** (externo o interno según usuarios).
3. **Credentials** → OAuth 2.0 Client ID:
   - Tipo **Web application**.
   - **Authorized redirect URIs**: la URL del callback que use vuestro backend o front (misma idea que Microsoft: exacta).
4. Scopes mínimos de solo lectura: `https://www.googleapis.com/auth/calendar.readonly` o `calendar.events.readonly`.
5. Para **refresh token** la primera vez: en la URL de autorización suele hacer falta `access_type=offline` y `prompt=consent` la primera vinculación.
6. Variables:
   - Client ID (y secret si el intercambio `code` → token es en **backend**): secret solo en Railway, no en Vercel.
   - Si usáis PKCE solo en front, el diseño de secretos cambia; lo más simple para equipo pequeño es **callback en API** y secret en servidor.

## 4. Frontend (decisión Google vs Outlook)

- Tras registro/login con JWT: pantalla **“Conectá tu calendario”** con dos botones.
- Cada botón: el de Microsoft llama a **`GET /auth/login`** (o sesión existente), luego  
  **`GET /integrations/microsoft/start?as_json=true`** con **`Authorization: Bearer <JWT>`**, recibe `authorize_url` y hace **`window.location = authorize_url`**.
- Tras OAuth, Microsoft vuelve a **`/callback`**; la API guarda tokens y redirige a **`{FRONTEND_URL}?calendar_microsoft=ok`** (o `error`).

## 5. Despliegue “cuando esté todo listo”

- Misma API en Railway: actualizar redirect URIs en Google y Azure con la URL **de producción**.
- Rotar secrets si alguna vez se filtraron en logs o en el front.
- Probar con un usuario de prueba: conectar → listar eventos → job de dossier.
