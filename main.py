import os
import sys
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

import msal
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import RedirectResponse

from calendar_service import listar_reuniones, obtener_reunion_por_id
from dossier.config import PROJECT_ROOT, load_env
from orchestrator import generar_dossier_ejecutivo

load_env()

app = FastAPI(
    title="Project Dossier API",
    description="Backend para la generación automática de informes de reuniones",
    version="0.2.0",
)

# Configuración de Microsoft desde el .env
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
            "openai": _status("OPENAI_API_KEY"),
            "google_oauth": _status("GOOGLE_CLIENT_ID"),
            "microsoft": _status("MICROSOFT_CLIENT_ID"),
        },
    }


# --- RUTAS DE AUTENTICACIÓN MICROSOFT OUTLOOK ---

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


# --- CALENDARIO + DOSSIER (Microsoft Graph → IA) ---

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


# --- DOSSIER MANUAL ---

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


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.2.0"}
