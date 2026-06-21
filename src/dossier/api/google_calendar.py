"""Rutas HTTP para leer Google Calendar y generar dossier (token OAuth del cliente)."""

from __future__ import annotations

import datetime
import json

import requests
from fastapi import APIRouter, HTTPException, Query, status

from dossier.services.google_calendar_api import normalizar_evento_google
from dossier.services.calendar_event_dossiers import generate_dossiers_from_calendar_event

router = APIRouter(prefix="/calendario", tags=["Calendario"])

GOOGLE_CALENDAR_SCOPES_DOC = (
    "https://www.googleapis.com/auth/calendar.readonly "
    "o https://www.googleapis.com/auth/calendar.events.readonly"
)


@router.post("/generar-dossier-google")
async def api_generar_dossier_desde_google(
    access_token: str = Query(
        ...,
        description=(
            "OAuth access token de Google con permiso de lectura de eventos. "
            f"Scopes: {GOOGLE_CALENDAR_SCOPES_DOC}"
        ),
    ),
):
    """
    Próximo evento en el calendario principal de Google + dossier con IA.
    El token debe obtenerse con OAuth incluyendo scope de Calendar.
    """
    try:
        ahora = (
            datetime.datetime.now(datetime.timezone.utc)
            .isoformat()
            .replace("+00:00", "Z")
        )
        headers = {"Authorization": f"Bearer {access_token}"}
        url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
        params = {
            "timeMin": ahora,
            "maxResults": 1,
            "singleEvents": True,
            "orderBy": "startTime",
        }
        response = requests.get(url, headers=headers, params=params, timeout=30)

        if response.status_code != 200:
            detail_google: dict | None
            try:
                detail_google = response.json()
            except json.JSONDecodeError:
                detail_google = None
            err_msg = (
                (detail_google or {}).get("error", {}).get("message")
                if isinstance(detail_google, dict)
                else None
            )
            insufficient = response.status_code == 403 and (
                "insufficient" in (err_msg or "").lower()
                or (
                    isinstance(detail_google, dict)
                    and "ACCESS_TOKEN_SCOPE_INSUFFICIENT" in json.dumps(detail_google)
                )
            )
            if insufficient:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        "El access_token no tiene permisos de Google Calendar. "
                        "Reautoriza con OAuth incluyendo: "
                        f"{GOOGLE_CALENDAR_SCOPES_DOC}"
                    ),
                )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    f"Google Calendar API {response.status_code}: "
                    f"{err_msg or response.text[:500]}"
                ),
            )

        eventos = response.json().get("items", [])
        if not eventos:
            raise HTTPException(
                status_code=404,
                detail="No hay eventos futuros en el calendario principal.",
            )

        evento = eventos[0]
        reunion = normalizar_evento_google(evento)
        result = generate_dossiers_from_calendar_event(reunion)
        return {
            "status": "Dossier generado automáticamente",
            "tema": reunion.get("tema"),
            "dossier_generado": result["dossier_generado"],
            "dossier_corporativo": result.get("dossier_corporativo"),
            "dossier_persona": result.get("dossier_persona"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error en el flujo automático: {str(e)}",
        ) from e
