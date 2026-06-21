"""Aplicación FastAPI (rutas HTTP). El punto de entrada del servidor está en `main.py` en la raíz."""
from __future__ import annotations

import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional
from urllib.parse import urlencode
from uuid import UUID

import msal
import requests
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from jwt.exceptions import PyJWTError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.requests import Request

from dossier.api.admin_routes import router as admin_router
from dossier.api.auth_routes import (
    auth_payload_and_user,
    get_current_user_and_org,
    get_db_if_configured,
    router as auth_router,
)
from dossier.api.dossier_routes import router as dossiers_router
from dossier.api.google_calendar import router as google_calendar_router
from dossier.config import PROJECT_ROOT, load_env
from dossier.db import is_database_configured
from dossier.db.connection import get_engine
from dossier.db.models import Organization, User
from dossier.security.jwt_tokens import (
    create_google_oauth_state,
    create_microsoft_oauth_state,
    decode_google_oauth_state,
    decode_microsoft_oauth_state,
)
from dossier.services import (
    generar_dossier_ejecutivo,
    listar_reuniones,
    obtener_reunion_por_id,
)
from dossier.services.calendar_integrations import (
    upsert_google_calendar_tokens,
    upsert_microsoft_calendar_tokens,
)
from dossier.services.google_calendar_api import listar_reuniones_google, obtener_reunion_google_por_id
from dossier.services.google_calendar_token import get_google_calendar_access_token_for_user
from dossier.services.graph_calendar import diagnostico_microsoft_calendar
from dossier.services.microsoft_calendar_token import get_microsoft_graph_access_token_for_user

load_env()

logger = logging.getLogger(__name__)


def _parse_cors_origins(raw: str) -> list[str]:
    """
    Normaliza CORS_ORIGINS: quita BOM/espacios, comillas (ASCII/tipográficas) y barra final.
    El navegador envía Origin sin barra final; si en Railway dejaste una, no coincidía.
    """
    # Comillas “curvas” típicas al copiar desde Word/Slack
    t = (
        raw.strip()
        .strip("\ufeff")
        .translate(
            str.maketrans(
                {
                    "\u201c": '"',
                    "\u201d": '"',
                    "\u2018": "'",
                    "\u2019": "'",
                }
            )
        )
    )
    out: list[str] = []
    for part in t.split(","):
        o = part.strip().strip('"').strip("'").rstrip("/")
        if o:
            out.append(o)
    return out


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Arranque/apagado de la app.

    Tras aplicar el SQL de migración (`docs/sql/schema_project_dossier.sql`), puedes
    poner `DATABASE_AUTO_CREATE_TABLES=0` en `.env` para no ejecutar `create_all`
    al arrancar (solo tu DDL en PostgreSQL).

    Si dejas el valor por defecto, SQLAlchemy crea tablas/columnas que falten
    (útil en desarrollo sin haber corrido aún toda la migración).
    """
    if is_database_configured():
        auto = os.getenv("DATABASE_AUTO_CREATE_TABLES", "1").strip().lower()
        if auto not in ("0", "false", "no"):
            from dossier.db import models  # noqa: F401 — registra modelos en metadata
            from dossier.db.base import Base

            engine = get_engine()
            Base.metadata.create_all(bind=engine)
    logger.info(
        "CORS: allow_origin_regex=%s, origins=%s",
        "on" if _cors_origin_regex else "off",
        _cors_origins,
    )
    yield


app = FastAPI(
    title="Project Dossier API",
    description="Backend para la generación automática de informes de reuniones",
    version="0.2.0",
    lifespan=lifespan,
)

# Orígenes permitidos para el dashboard Next.js (navegador bloquea sin CORS).
def _default_cors_origins_csv() -> str:
    """Puertos 3000–3009 en localhost / 127.0.0.1 / ::1 (Next suele saltar de puerto si 3000 está ocupado)."""
    parts: list[str] = []
    for port in range(3000, 3010):
        parts.extend(
            [
                f"http://localhost:{port}",
                f"http://127.0.0.1:{port}",
                f"http://[::1]:{port}",
            ]
        )
    return ",".join(parts)


_cors_raw = os.getenv("CORS_ORIGINS", _default_cors_origins_csv())
_cors_origins = _parse_cors_origins(_cors_raw)
# Cada preview en Vercel tiene un subdominio distinto (hash, rama, equipo).
# fullmatch() sobre el header Origin (sin path). Desactivar: CORS_ALLOW_VERCEL_APP_REGEX=0
_cors_vercel_re = os.getenv("CORS_ALLOW_VERCEL_APP_REGEX", "1").strip().lower()
_cors_origin_regex: str | None = None
if _cors_vercel_re not in ("0", "false", "no"):
    _custom = (os.getenv("CORS_VERCEL_ORIGIN_REGEX") or "").strip()
    if _custom:
        try:
            re.compile(_custom)
        except re.error:
            logger.warning("CORS_VERCEL_ORIGIN_REGEX inválida; se usa el patrón por defecto.")
        else:
            _cors_origin_regex = _custom
    if _cors_origin_regex is None:
        # Amplio pero solo host *.vercel.app (Origin nunca incluye path).
        _cors_origin_regex = r"https://.+\.vercel\.app"
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(dossiers_router)
app.include_router(google_calendar_router)

CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID")
CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET")
TENANT_ID = os.getenv("MICROSOFT_TENANT_ID", "common")
REDIRECT_URI = os.getenv("MICROSOFT_REDIRECT_URI")

GOOGLE_CLIENT_ID = (os.getenv("GOOGLE_CLIENT_ID") or "").strip() or None
GOOGLE_CLIENT_SECRET = (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip() or None
# Acepta GOOGLE_REDIRECT_URL por si el .env usa el nombre antiguo (typo).
GOOGLE_REDIRECT_URI = (
    (os.getenv("GOOGLE_REDIRECT_URI") or os.getenv("GOOGLE_REDIRECT_URL") or "").strip() or None
)
GOOGLE_OAUTH_SCOPES = (
    "openid https://www.googleapis.com/auth/userinfo.email "
    "https://www.googleapis.com/auth/calendar.readonly"
)

AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
# User.Read: perfil /me en Graph (nombre, correo). Calendars.Read: eventos.
SCOPES = ["Calendars.Read", "User.Read"]


def get_msal_app():
    return msal.ConfidentialClientApplication(
        CLIENT_ID,
        authority=AUTHORITY,
        client_credential=CLIENT_SECRET,
    )


def _status(name: str) -> str:
    return "Configurada ✅" if os.getenv(name) else "Faltante ❌"


def _graph_token_for_calendar_route(
    db: Session,
    authorization: Optional[str],
    access_token: Optional[str],
) -> str:
    """
    Token de Microsoft Graph para rutas de calendario.

    - Si viene ``?access_token=`` (Graph), se usa tal cual (pruebas / legado).
    - Si no: ``Authorization: Bearer`` debe ser el **JWT de la app**; se lee o renueva
      el token desde ``calendar_integrations``.
    """
    if access_token:
        return access_token.strip()
    _, user = auth_payload_and_user(db, authorization)
    return get_microsoft_graph_access_token_for_user(db, user.id)


def _google_authorize_url(state: str) -> str:
    if not GOOGLE_CLIENT_ID or not GOOGLE_REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="Faltan GOOGLE_CLIENT_ID o GOOGLE_REDIRECT_URI.",
        )
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": GOOGLE_OAUTH_SCOPES,
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def _google_exchange_authorization_code(code: str) -> dict:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REDIRECT_URI.",
        )
    r = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    try:
        body = r.json()
    except Exception:
        body = {}
    if r.status_code != 200 or "access_token" not in body:
        msg = body.get("error_description") or body.get("error") or r.text[:400]
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo intercambiar el código OAuth de Google: {msg}",
        )
    return body


def _google_userinfo(access_token: str) -> dict:
    r = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )
    if not r.ok:
        return {}
    try:
        out = r.json()
        return out if isinstance(out, dict) else {}
    except Exception:
        return {}


def _google_token_for_calendar_route(
    db: Session,
    authorization: Optional[str],
    access_token: Optional[str],
) -> str:
    if access_token:
        return access_token.strip()
    _, user = auth_payload_and_user(db, authorization)
    return get_google_calendar_access_token_for_user(db, user.id)


def _oauth_frontend_base(*, for_calendar_callback: bool = False) -> str:
    """URL del front (sin barra final) para redirigir tras OAuth con ``state``."""
    base = (
        os.getenv("FRONTEND_URL", "").strip().rstrip("/")
        or os.getenv("MICROSOFT_OAUTH_SUCCESS_URL", "").strip().rstrip("/")
    )
    if not base or not for_calendar_callback:
        return base
    # El banner ``calendar_*=ok|error`` vive en el dashboard del SPA.
    if not base.endswith("/dashboard"):
        base = f"{base}/dashboard"
    return base


def _redirect_calendar_oauth(**params: str) -> RedirectResponse | None:
    base = _oauth_frontend_base(for_calendar_callback=True)
    if not base:
        return None
    return RedirectResponse(f"{base}?{urlencode(params)}", status_code=302)


@app.get("/")
def read_root():
    return {
        "message": "Bienvenido a la API de Project Dossier",
        "status": "Online",
        "project_root": str(PROJECT_ROOT),
        "config_check": {
            "companies_house": _status("COMPANIES_HOUSE_API_KEY"),
            "gemini": _status("GEMINI_API_KEY"),
            "lusha": _status("LUSHA_API_KEY"),
            "openai": _status("OPENAI_API_KEY"),
            "google_oauth": _status("GOOGLE_CLIENT_ID"),
            "microsoft": _status("MICROSOFT_CLIENT_ID"),
            "app_auth_jwt": _status("JWT_SECRET"),
            "postgresql": "configurada ✅"
            if is_database_configured()
            else "no configurada (opcional)",
        },
    }


@app.get("/integrations/microsoft/start", tags=["Integraciones"])
def integrations_microsoft_start(
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    as_json: bool = Query(
        False,
        description="Si true, devuelve JSON con authorize_url (recomendado para SPA: fetch + Bearer).",
    ),
):
    """
    Inicia OAuth Microsoft ligado al usuario de la app (JWT).

    - **Navegador sin cabecera:** no sirve abrir esta URL a mano; devuelve 401.
    - **SPA:** ``fetch(..., { headers: { Authorization: Bearer }, redirect: 'manual' })``
      con ``as_json=true`` y luego ``window.location = data.authorize_url``.
    - **Redirect directo:** ``as_json=false`` (por defecto) responde 302 a Microsoft
      (útil con ``curl -L -H 'Authorization: Bearer …'``).
    """
    if not CLIENT_ID or not CLIENT_SECRET or not REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="Faltan MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET o MICROSOFT_REDIRECT_URI.",
        )

    user, org = user_org
    state = create_microsoft_oauth_state(
        user_id=str(user.id),
        organization_id=str(org.id),
    )
    msal_app = get_msal_app()
    auth_url = msal_app.get_authorization_request_url(
        SCOPES,
        redirect_uri=REDIRECT_URI,
        state=state,
    )
    if as_json:
        return JSONResponse({"authorize_url": auth_url})
    return RedirectResponse(auth_url)


@app.get("/integrations/google/start", tags=["Integraciones"])
def integrations_google_start(
    user_org: Annotated[tuple[User, Organization], Depends(get_current_user_and_org)],
    as_json: bool = Query(
        False,
        description="Si true, devuelve JSON con authorize_url (recomendado para SPA: fetch + Bearer).",
    ),
):
    """
    Inicia OAuth Google Calendar ligado al usuario de la app (JWT).

    Igual patrón que ``/integrations/microsoft/start``: usar ``as_json=true`` desde el SPA.
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REDIRECT_URI.",
        )

    user, org = user_org
    state = create_google_oauth_state(
        user_id=str(user.id),
        organization_id=str(org.id),
    )
    auth_url = _google_authorize_url(state)
    if as_json:
        return JSONResponse(
            {
                "authorize_url": auth_url,
                "redirect_uri": GOOGLE_REDIRECT_URI,
            }
        )
    return RedirectResponse(auth_url)


@app.get("/integrations/google/oauth-config", tags=["Integraciones"])
def integrations_google_oauth_config():
    """
    URI de callback que la API envía a Google (sin secretos).
    Debe estar **idéntica** en Google Cloud → Credentials → Authorized redirect URIs.
    """
    return {
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "client_id_configured": bool(GOOGLE_CLIENT_ID),
        "client_id_suffix": (GOOGLE_CLIENT_ID or "")[-20:] if GOOGLE_CLIENT_ID else None,
        "hint": (
            "Si ves redirect_uri_mismatch, copia redirect_uri tal cual en la consola de Google "
            "(localhost y 127.0.0.1 son distintos)."
        ),
    }


@app.get("/login-microsoft", tags=["Autenticación Microsoft"])
def login_microsoft():
    """Redirige a Microsoft **sin** vincular usuario de la app (solo pruebas / legado)."""
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Faltan las credenciales de Microsoft en el archivo .env",
        )

    msal_app = get_msal_app()
    auth_url = msal_app.get_authorization_request_url(SCOPES, redirect_uri=REDIRECT_URI)
    return RedirectResponse(auth_url)


@app.get("/callback", tags=["Autenticación Microsoft"])
def callback(
    code: Optional[str] = None,
    error: Optional[str] = None,
    state: Optional[str] = None,
    db: Session = Depends(get_db_if_configured),
):
    """
    Intercambia ``code`` por tokens. Si venía ``state`` de ``/integrations/microsoft/start``,
    guarda tokens en ``calendar_integrations`` y redirige al front (``FRONTEND_URL``).
    Sin ``state``, mantiene respuesta JSON (pruebas / legado).
    """
    if error:
        redir = _redirect_calendar_oauth(calendar_microsoft="error", reason=error[:180])
        if redir and state:
            return redir
        raise HTTPException(status_code=400, detail=f"Error de Microsoft: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="No se recibió el código de autorización.")

    msal_app = get_msal_app()
    result = msal_app.acquire_token_by_authorization_code(
        code,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )

    if "access_token" not in result:
        msg = result.get("error_description") or result.get("error") or "token desconocido"
        redir = _redirect_calendar_oauth(calendar_microsoft="error", reason=str(msg)[:180])
        if redir and state:
            return redir
        raise HTTPException(status_code=400, detail=f"No se pudo obtener el token: {msg}")

    access_token = result["access_token"]
    claims = result.get("id_token_claims") or {}
    refresh_token = result.get("refresh_token")
    expires_in = int(result.get("expires_in") or 3600)
    granted = " ".join(SCOPES)

    if state:
        if not _oauth_frontend_base():
            raise HTTPException(
                status_code=500,
                detail=(
                    "Define FRONTEND_URL o MICROSOFT_OAUTH_SUCCESS_URL para redirigir tras OAuth "
                    "cuando se usa state (flujo integrado)."
                ),
            )
        try:
            payload = decode_microsoft_oauth_state(state)
            user_id = UUID(str(payload["sub"]))
            org_id = UUID(str(payload["org_id"]))
        except (PyJWTError, KeyError, ValueError) as e:
            redir = _redirect_calendar_oauth(
                calendar_microsoft="error",
                reason=f"state_invalid:{type(e).__name__}",
            )
            if redir:
                return redir
            raise HTTPException(status_code=400, detail="state inválido o expirado.") from e

        try:
            upsert_microsoft_calendar_tokens(
                db,
                user_id=user_id,
                organization_id=org_id,
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in_seconds=expires_in,
                granted_scopes=granted,
                id_token_claims=claims,
            )
        except SQLAlchemyError as e:
            logger.exception("No se pudo guardar calendar_integrations")
            redir = _redirect_calendar_oauth(
                calendar_microsoft="error",
                reason="db_error",
            )
            if redir:
                return redir
            raise HTTPException(status_code=500, detail="Error al guardar la integración.") from e

        redir_ok = _redirect_calendar_oauth(calendar_microsoft="ok")
        if redir_ok:
            return redir_ok
        raise HTTPException(status_code=500, detail="FRONTEND_URL no configurada.")

    return {
        "mensaje": "Autenticación exitosa con Microsoft",
        "usuario": claims.get("name"),
        "correo": claims.get("preferred_username"),
        "access_token": access_token,
    }


@app.get("/callback-google", tags=["Integraciones"])
def callback_google(
    code: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    state: Optional[str] = None,
    db: Session = Depends(get_db_if_configured),
):
    """
    Callback OAuth Google: intercambia ``code`` por tokens y guarda en ``calendar_integrations``.
    Redirige al frontend con ``calendar_google=ok`` o ``calendar_google=error``.
    """
    if error:
        msg = (error_description or error or "unknown")[:180]
        redir = _redirect_calendar_oauth(calendar_google="error", reason=msg)
        if redir and state:
            return redir
        raise HTTPException(status_code=400, detail=f"Error de Google: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="No se recibió el código de autorización.")

    try:
        tok = _google_exchange_authorization_code(code)
    except HTTPException as e:
        det = e.detail
        rsn = (det[:180] if isinstance(det, str) else "token_exchange")[:180]
        redir = _redirect_calendar_oauth(calendar_google="error", reason=rsn)
        if redir and state:
            return redir
        raise

    access_token = tok["access_token"]
    refresh_token = tok.get("refresh_token")
    expires_in = int(tok.get("expires_in") or 3600)
    granted = str(tok.get("scope") or GOOGLE_OAUTH_SCOPES)

    userinfo = _google_userinfo(access_token)

    if not state:
        return {
            "mensaje": "Autenticación exitosa con Google (sin state; solo pruebas)",
            "userinfo": userinfo,
        }

    if not _oauth_frontend_base():
        raise HTTPException(
            status_code=500,
            detail="Define FRONTEND_URL o MICROSOFT_OAUTH_SUCCESS_URL para redirigir tras OAuth.",
        )

    try:
        payload = decode_google_oauth_state(state)
        user_id = UUID(str(payload["sub"]))
        org_id = UUID(str(payload["org_id"]))
    except (PyJWTError, KeyError, ValueError) as e:
        redir = _redirect_calendar_oauth(
            calendar_google="error",
            reason=f"state_invalid:{type(e).__name__}",
        )
        if redir:
            return redir
        raise HTTPException(status_code=400, detail="state inválido o expirado.") from e

    try:
        upsert_google_calendar_tokens(
            db,
            user_id=user_id,
            organization_id=org_id,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in_seconds=expires_in,
            granted_scopes=granted,
            userinfo=userinfo,
        )
    except SQLAlchemyError as e:
        logger.exception("No se pudo guardar calendar_integrations Google")
        redir = _redirect_calendar_oauth(calendar_google="error", reason="db_error")
        if redir:
            return redir
        raise HTTPException(status_code=500, detail="Error al guardar la integración.") from e

    redir_ok = _redirect_calendar_oauth(calendar_google="ok")
    if redir_ok:
        return redir_ok
    raise HTTPException(status_code=500, detail="FRONTEND_URL no configurada.")


@app.get("/calendario/eventos", tags=["Calendario"])
def api_listar_eventos_calendario(
    top: int = Query(10, ge=1, le=50, description="Cantidad máxima de reuniones"),
    dias: int = Query(90, ge=1, le=365, description="Días hacia adelante a buscar"),
    incluir_pasadas: bool = Query(
        False,
        description="Si true, muestra también eventos pasados (útil para probar)",
    ),
    access_token: Optional[str] = Query(
        None,
        description="Opcional: token de Graph (legado). Si se omite, Authorization es el JWT de la app.",
    ),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_if_configured),
):
    """Lista reuniones de Outlook: JWT de la app + tokens en BD, o ``?access_token=`` para pruebas."""
    token = _graph_token_for_calendar_route(db, authorization, access_token)
    try:
        reuniones = listar_reuniones(
            token,
            top=top,
            dias_adelante=dias,
            incluir_pasadas=incluir_pasadas,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    mensaje = None
    if not reuniones:
        mensaje = (
            "No se encontraron eventos. Crea una reunión de prueba en Outlook "
            "(outlook.com → Calendario) o prueba con incluir_pasadas=true."
        )

    return {"total": len(reuniones), "reuniones": reuniones, "mensaje": mensaje}


@app.get("/calendario/eventos-google", tags=["Calendario"])
def api_listar_eventos_google_calendar(
    top: int = Query(10, ge=1, le=50, description="Cantidad máxima de eventos"),
    dias: int = Query(90, ge=1, le=365, description="Días hacia adelante a buscar"),
    incluir_pasadas: bool = Query(
        False,
        description="Si true, incluye ventana de eventos pasados recientes (útil para probar)",
    ),
    access_token: Optional[str] = Query(
        None,
        description="Opcional: access token de Google Calendar (legado). Si se omite, Authorization es el JWT de la app.",
    ),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_if_configured),
):
    """Lista eventos del calendario principal de Google: JWT de la app + tokens en BD."""
    token = _google_token_for_calendar_route(db, authorization, access_token)
    try:
        reuniones = listar_reuniones_google(
            token,
            top=top,
            dias_adelante=dias,
            incluir_pasadas=incluir_pasadas,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    mensaje = None
    if not reuniones:
        mensaje = (
            "No se encontraron eventos. Crea un evento en Google Calendar "
            "o prueba con incluir_pasadas=true."
        )

    return {"total": len(reuniones), "reuniones": reuniones, "mensaje": mensaje}


@app.get("/calendario/diagnostico-microsoft", tags=["Calendario"])
def api_diagnostico_microsoft_calendario(
    access_token: Optional[str] = Query(
        None,
        description="Opcional: token de Graph (legado). Si se omite, Authorization es el JWT de la app.",
    ),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_if_configured),
):
    """
    Quién es ``/me`` en Graph, cuántos calendarios hay y si existen eventos
    en el calendario predeterminado (si /calendario/eventos viene vacío).
    """
    token = _graph_token_for_calendar_route(db, authorization, access_token)
    try:
        return diagnostico_microsoft_calendar(token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/calendario/generar-dossiers", tags=["Calendario"])
def api_generar_dossiers_desde_calendario(
    top: int = Query(5, ge=1, le=10, description="Máximo de reuniones a procesar con IA"),
    event_id: Optional[str] = Query(
        None, description="Si se indica, solo genera dossier para esa reunión"
    ),
    access_token: Optional[str] = Query(
        None,
        description="Opcional: token de Graph (legado). Si se omite, Authorization es el JWT de la app.",
    ),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_if_configured),
):
    """Lee el calendario con Graph API y genera dossiers con IA para cada reunión (o una por id)."""
    token = _graph_token_for_calendar_route(db, authorization, access_token)

    try:
        if event_id:
            reunion = obtener_reunion_por_id(token, event_id)
            if not reunion:
                raise HTTPException(
                    status_code=404,
                    detail="No se encontró la reunión con ese event_id en el calendario.",
                )
            reuniones = [reunion]
        else:
            reuniones = listar_reuniones(token, top=top, dias_adelante=90)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if not reuniones:
        return {
            "mensaje": "No hay reuniones próximas en el calendario.",
            "dossiers": [],
        }

    dossiers = []
    for reunion in reuniones:
        informe = generar_dossier_ejecutivo(
            tema_reunion=reunion["tema"],
            participantes=reunion["participantes"],
            descripcion=reunion.get("descripcion", ""),
        )
        dossiers.append(
            {
                "reunion": reunion,
                "dossier_generado": informe,
            }
        )

    return {
        "total": len(dossiers),
        "dossiers": dossiers,
    }


@app.get("/calendario/generar-dossiers-google", tags=["Calendario"])
def api_generar_dossiers_desde_google_calendar(
    top: int = Query(5, ge=1, le=10, description="Máximo de eventos a procesar con IA"),
    event_id: Optional[str] = Query(
        None, description="Si se indica, solo genera dossier para ese evento de Google Calendar"
    ),
    access_token: Optional[str] = Query(
        None,
        description="Opcional: access token de Google (legado). Si se omite, Authorization es el JWT de la app.",
    ),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_if_configured),
):
    """Lee Google Calendar y genera dossiers con IA (mismo shape que ``/calendario/generar-dossiers``)."""
    token = _google_token_for_calendar_route(db, authorization, access_token)

    try:
        if event_id:
            reunion = obtener_reunion_google_por_id(token, event_id)
            if not reunion:
                raise HTTPException(
                    status_code=404,
                    detail="No se encontró el evento con ese id en Google Calendar.",
                )
            reuniones = [reunion]
        else:
            reuniones = listar_reuniones_google(token, top=top, dias_adelante=90)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if not reuniones:
        return {
            "mensaje": "No hay eventos próximos en Google Calendar.",
            "dossiers": [],
        }

    dossiers = []
    for reunion in reuniones:
        informe = generar_dossier_ejecutivo(
            tema_reunion=reunion["tema"],
            participantes=reunion["participantes"],
            descripcion=reunion.get("descripcion", ""),
        )
        dossiers.append(
            {
                "reunion": reunion,
                "dossier_generado": informe,
            }
        )

    return {
        "total": len(dossiers),
        "dossiers": dossiers,
    }


@app.get("/generar-dossier")
def api_generar_dossier(tema: str, participantes: str, descripcion: str = ""):
    """Genera un dossier con IA a partir de tema y participantes."""
    informe = generar_dossier_ejecutivo(tema, participantes, descripcion)

    return {
        "tema": tema,
        "participantes": participantes,
        "descripcion": descripcion,
        "dossier_generado": informe,
    }


@app.get("/db/health", tags=["Base de datos"])
def db_health():
    """
    Comprueba conexión a PostgreSQL. Las credenciales solo viven en .env local (no en git).
    """
    if not is_database_configured():
        return {
            "postgresql": "not_configured",
            "hint": (
                "Define DATABASE_URL o POSTGRES_HOST/USER/PASSWORD/DB en .env. "
                "Copia .env.example; cada quien usa su base local."
            ),
        }
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        url = engine.url
        # Sin credenciales: ayuda a comprobar que pgAdmin y la API apuntan al mismo servidor/BD.
        connection = {
            "host": url.host or "",
            "port": int(url.port or 5432),
            "database": url.database or "",
        }
        return {
            "postgresql": "ok",
            "mensaje": "Conexión exitosa con la base de datos PostgreSQL.",
            "connection": connection,
        }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"postgresql": "error", "detail": str(e)},
        )


@app.get("/health")
def health_check():
    """Incluye resumen CORS para comprobar en producción qué cargó el proceso (sin secretos)."""
    return {
        "status": "ok",
        "version": "0.2.0",
        "cors": {
            "vercel_origin_regex": bool(_cors_origin_regex),
            "allowed_origins": _cors_origins,
        },
    }


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(_request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """
    Errores de BD (p. ej. columna inexistente si no corriste la migración) devuelven JSON
    en lugar de ``text/plain`` de uvicorn, y el CORS del middleware aplica al JSON.
    """
    logger.exception("Error SQLAlchemy: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": (
                "Error al consultar la base de datos. Suele deberse a que el esquema PostgreSQL "
                "no coincide con el código (falta ejecutar el SQL de migración en Railway)."
            ),
            "error_type": type(exc).__name__,
        },
    )
