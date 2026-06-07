"""
Lectura del calendario de Outlook vía Microsoft Graph API.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import requests

GRAPH_EVENTS_URL = "https://graph.microsoft.com/v1.0/me/calendar/events"
GRAPH_CALENDAR_VIEW_URL = "https://graph.microsoft.com/v1.0/me/calendar/calendarView"

_SELECT = "id,subject,bodyPreview,start,end,attendees,organizer,location,isAllDay"


def _headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Prefer": 'outlook.timezone="UTC"',
    }


def _iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get_graph(url: str, access_token: str, params: dict) -> dict:
    response = requests.get(
        url,
        headers=_headers(access_token),
        params=params,
        timeout=30,
    )

    if response.status_code == 401:
        raise ValueError(
            "Token inválido o expirado. Vuelve a iniciar sesión con /login-microsoft."
        )
    if not response.ok:
        raise ValueError(
            f"Error al consultar Microsoft Graph ({response.status_code}): {response.text}"
        )

    return response.json()


def obtener_eventos_proximos(
    access_token: str,
    top: int = 10,
    dias_adelante: int = 90,
) -> dict:
    """
    Usa calendarView: forma recomendada por Microsoft para eventos en un rango de fechas.
    """
    inicio = datetime.now(timezone.utc)
    fin = inicio + timedelta(days=dias_adelante)

    params = {
        "startDateTime": _iso_utc(inicio),
        "endDateTime": _iso_utc(fin),
        "$top": top,
        "$orderby": "start/dateTime",
        "$select": _SELECT,
    }

    return _get_graph(GRAPH_CALENDAR_VIEW_URL, access_token, params)


def obtener_todos_los_eventos(access_token: str, top: int = 50) -> dict:
    """Lista eventos sin filtro de fecha (útil para depurar calendarios vacíos).

    Orden por ``createdDateTime`` para que reuniones recién creadas aparezcan
    primero (con ``start`` desc un evento futuro lejano podía quedar fuera del top).
    """
    params = {
        "$top": top,
        "$orderby": "createdDateTime desc",
        "$select": _SELECT,
    }
    return _get_graph(GRAPH_EVENTS_URL, access_token, params)


def _formatear_participantes(evento: dict) -> str:
    """Convierte asistentes y organizador en texto para el orquestador."""
    nombres: list[str] = []

    organizador = evento.get("organizer", {}).get("emailAddress", {})
    if organizador:
        nombre = organizador.get("name") or organizador.get("address", "")
        if nombre:
            nombres.append(f"{nombre} (organizador)")

    for asistente in evento.get("attendees") or []:
        correo = asistente.get("emailAddress", {})
        nombre = correo.get("name") or correo.get("address", "")
        if nombre and nombre not in nombres:
            nombres.append(nombre)

    return ", ".join(nombres) if nombres else "No especificados"


def normalizar_evento(evento: dict) -> dict:
    """Reduce un evento de Graph a los campos que usa el dossier."""
    inicio = (evento.get("start") or {}).get("dateTime", "")
    fin = (evento.get("end") or {}).get("dateTime", "")

    return {
        "id": evento.get("id"),
        "tema": evento.get("subject") or "Sin asunto",
        "descripcion": evento.get("bodyPreview") or "",
        "participantes": _formatear_participantes(evento),
        "inicio": inicio,
        "fin": fin,
        "ubicacion": (evento.get("location") or {}).get("displayName") or "",
        "todo_el_dia": evento.get("isAllDay", False),
    }


def diagnostico_microsoft_calendar(access_token: str) -> dict:
    """
    Resumen no sensible: qué usuario ve Graph y si hay eventos en el calendario
    predeterminado (útil si /calendario/eventos devuelve vacío).
    """
    resultado: dict = {
        "me": None,
        "calendars": None,
        "events_raw_count": None,
        "events_preview": None,
        "errors": [],
    }
    url_me = "https://graph.microsoft.com/v1.0/me"
    url_cals = "https://graph.microsoft.com/v1.0/me/calendars"

    try:
        r = requests.get(url_me, headers=_headers(access_token), timeout=30)
        if r.ok:
            j = r.json()
            resultado["me"] = {
                "displayName": j.get("displayName"),
                "mail": j.get("mail"),
                "userPrincipalName": j.get("userPrincipalName"),
                "id": j.get("id"),
            }
        else:
            resultado["errors"].append(f"GET /me → {r.status_code}: {r.text[:300]}")
    except requests.RequestException as e:
        resultado["errors"].append(f"GET /me → {e}")

    try:
        r = requests.get(url_cals, headers=_headers(access_token), timeout=30)
        if r.ok:
            j = r.json()
            vals = j.get("value", [])
            resultado["calendars"] = {
                "count": len(vals),
                "names": [c.get("name") for c in vals[:15]],
            }
        else:
            resultado["errors"].append(f"GET /me/calendars → {r.status_code}: {r.text[:300]}")
    except requests.RequestException as e:
        resultado["errors"].append(f"GET /me/calendars → {e}")

    try:
        r = requests.get(
            GRAPH_EVENTS_URL,
            headers=_headers(access_token),
            params={
                "$top": 10,
                "$orderby": "createdDateTime desc",
                "$select": "id,subject,start,createdDateTime",
            },
            timeout=30,
        )
        if r.ok:
            j = r.json()
            vals = j.get("value", [])
            resultado["events_raw_count"] = len(vals)
            resultado["events_preview"] = [
                {
                    "subject": v.get("subject"),
                    "start": (v.get("start") or {}).get("dateTime"),
                    "createdDateTime": v.get("createdDateTime"),
                }
                for v in vals
            ]
        else:
            resultado["errors"].append(
                f"GET /me/calendar/events → {r.status_code}: {r.text[:300]}"
            )
    except requests.RequestException as e:
        resultado["errors"].append(f"GET /me/calendar/events → {e}")

    return resultado


def listar_reuniones(
    access_token: str,
    top: int = 10,
    dias_adelante: int = 90,
    incluir_pasadas: bool = False,
) -> list[dict]:
    """
    Devuelve reuniones normalizadas.
    Por defecto: próximos `dias_adelante` días vía calendarView.
    Con incluir_pasadas=True: cualquier evento reciente del calendario.
    """
    if incluir_pasadas:
        # Más filas: con pocos slots, eventos nuevos podían quedar fuera del top.
        datos = obtener_todos_los_eventos(access_token, top=max(top, 50))
    else:
        datos = obtener_eventos_proximos(
            access_token, top=top, dias_adelante=dias_adelante
        )

    return [normalizar_evento(e) for e in datos.get("value", [])]


def obtener_reunion_por_id(
    access_token: str,
    event_id: str,
    dias_adelante: int = 90,
) -> dict | None:
    """Busca una reunión por id en el rango del calendario."""
    for reunion in listar_reuniones(
        access_token, top=50, dias_adelante=dias_adelante, incluir_pasadas=True
    ):
        if reunion.get("id") == event_id:
            return reunion
    return None
