"""Parsing de eventos de calendario para dossiers empresa vs persona."""
from __future__ import annotations

from dossier.services.calendar_event_dossiers import (
    parse_calendar_event_for_dossiers,
    resolve_corporate_company,
)


def test_person_only_with_contacto_no_corporate() -> None:
    reunion = {
        "tema": "Reunión con Victor Escobar",
        "descripcion": "Contacto: Victor Escobar\nCargo: Director",
        "participantes": "victor@empresa.com; otro@correo.com",
    }
    parsed = parse_calendar_event_for_dossiers(reunion)
    assert parsed["company_corporate"] == ""
    assert parsed["person_name"] == "Victor Escobar"


def test_reunion_con_subject_without_empresa_is_person_only() -> None:
    corp, source = resolve_corporate_company(
        "Reunión con Ana García",
        "Contacto: Ana García",
    )
    assert corp == ""
    assert source == ""


def test_explicit_empresa_still_generates_corporate() -> None:
    reunion = {
        "tema": "Kick-off",
        "descripcion": "Empresa: INJUV\nContacto: Mauricio Fuentes",
        "participantes": "mauricio@injuv.cl",
    }
    parsed = parse_calendar_event_for_dossiers(reunion)
    assert parsed["company_corporate"] == "INJUV"
    assert parsed["person_name"] == "Mauricio Fuentes"


def test_participantes_alone_do_not_imply_corporate() -> None:
    corp, _ = resolve_corporate_company(
        "Sync semanal",
        "Contacto: Juan Pérez",
    )
    assert corp == ""


def test_commercial_subject_with_company() -> None:
    corp, source = resolve_corporate_company(
        "Reunión comercial — Nvidia Corp",
        "",
    )
    assert corp == "Nvidia Corp"
    assert source == "subject"
