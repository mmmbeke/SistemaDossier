"""Aplicación FastAPI (rutas HTTP). El punto de entrada del servidor está en `main.py` en la raíz."""
from __future__ import annotations

import logging
import os
import re
from contextlib import asynccontextmanager
from typing import Optional

import msal
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import text

from dossier.api.admin_routes import router as admin_router
from dossier.api.auth_routes import router as auth_router
from dossier.api.dossier_routes import router as dossiers_router
from dossier.api.google_calendar import router as google_calendar_router
from dossier.config import PROJECT_ROOT, load_env
from dossier.db import is_database_configured
from dossier.db.connection import get_engine
from dossier.services import (
    generar_dossier_ejecutivo,
    listar_reuniones,
    obtener_reunion_por_id,
)

load_env()

logger = logging.getLogger(__name__)


def _parse_cors_origins(raw: str) -> list[str]:
    """
    Normaliza CORS_ORIGINS: quita BOM/espacios y barra final.
    El navegador envía Origin sin barra final; si en Railway dejaste una, no coincidía.
    """
    out: list[str] = []
    for part in raw.split(","):
        o = part.strip().strip("\ufeff").rstrip("/")
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
_cors_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://[::1]:3000",
)
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

AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
SCOPES = ["Calendars.Read"]


def get_msal_app():
    return msal.ConfidentialClientApplication(
        CLIENT_ID,
        authority=AUTHORITY,
        client_credential=CLIENT_SECRET,
    )


def _status(name: str) -> str:
    return "Configurada ✅" if os.getenv(name) else "Faltante ❌"


def _resolver_access_token(
    authorization: Optional[str] = None,
    access_token: Optional[str] = None,
) -> str:
    """Acepta token por query (?access_token=) o cabecera Authorization: Bearer."""
    if access_token:
        return access_token.strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    raise HTTPException(
        status_code=401,
        detail=(
            "Falta el token. Pásalo como ?access_token=... "
            "o cabecera Authorization: Bearer <token>"
        ),
    )


@app.get("/")
def read_root():
    return {
        "message": "Bienvenido a la API de Project Dossier",
        "status": "Online",
        "project_root": str(PROJECT_ROOT),
        "config_check": {
            "companies_house": _status("COMPANIES_HOUSE_API_KEY"),
            "gemini": _status("GEMINI_API_KEY"),
            "netrows": _status("NETROWS_API_KEY"),
            "openai": _status("OPENAI_API_KEY"),
            "google_oauth": _status("GOOGLE_CLIENT_ID"),
            "microsoft": _status("MICROSOFT_CLIENT_ID"),
            "app_auth_jwt": _status("JWT_SECRET"),
            "postgresql": "configurada ✅"
            if is_database_configured()
            else "no configurada (opcional)",
        },
    }


@app.get("/login-microsoft", tags=["Autenticación Microsoft"])
def login_microsoft():
    """Redirige al usuario a la página de inicio de sesión de Microsoft."""
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Faltan las credenciales de Microsoft en el archivo .env",
        )

    msal_app = get_msal_app()
    auth_url = msal_app.get_authorization_request_url(SCOPES, redirect_uri=REDIRECT_URI)
    return RedirectResponse(auth_url)


@app.get("/callback", tags=["Autenticación Microsoft"])
def callback(code: str = None, error: str = None):
    """Recibe el código de autorización de Microsoft y lo cambia por un token."""
    if error:
        raise HTTPException(status_code=400, detail=f"Error de Microsoft: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="No se recibió el código de autorización.")

    msal_app = get_msal_app()
    result = msal_app.acquire_token_by_authorization_code(
        code,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )

    if "access_token" in result:
        return {
            "mensaje": "Autenticación exitosa con Microsoft",
            "usuario": result.get("id_token_claims", {}).get("name"),
            "correo": result.get("id_token_claims", {}).get("preferred_username"),
            "access_token": result["access_token"],
        }

    raise HTTPException(
        status_code=400,
        detail=f"No se pudo obtener el token: {result.get('error_description')}",
    )


@app.get("/calendario/eventos", tags=["Calendario"])
def api_listar_eventos_calendario(
    top: int = Query(10, ge=1, le=50, description="Cantidad máxima de reuniones"),
    dias: int = Query(90, ge=1, le=365, description="Días hacia adelante a buscar"),
    incluir_pasadas: bool = Query(
        False,
        description="Si true, muestra también eventos pasados (útil para probar)",
    ),
    access_token: Optional[str] = Query(None, description="Token de /callback"),
    authorization: Optional[str] = Header(None),
):
    """Lista reuniones del calendario de Outlook usando el access_token de Microsoft."""
    token = _resolver_access_token(authorization, access_token)
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


@app.get("/calendario/generar-dossiers", tags=["Calendario"])
def api_generar_dossiers_desde_calendario(
    top: int = Query(5, ge=1, le=10, description="Máximo de reuniones a procesar con IA"),
    event_id: Optional[str] = Query(
        None, description="Si se indica, solo genera dossier para esa reunión"
    ),
    access_token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """Lee el calendario con Graph API y genera dossiers con IA para cada reunión (o una por id)."""
    token = _resolver_access_token(authorization, access_token)

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
    return {"status": "ok", "version": "0.2.0"}
