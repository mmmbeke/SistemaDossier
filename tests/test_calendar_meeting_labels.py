"""Parseo de etiquetas de calendario en varios idiomas."""

from dossier.services.calendar_event_dossiers import (
    extract_company_from_description,
    extract_person_from_description,
    parse_calendar_event_for_dossiers,
)
from dossier.services.calendar_event_filters import has_business_meeting_signals


def test_italian_labels_same_line():
    desc = "Azienda: NoonDalton Contatto: Edward Dalton"
    assert extract_company_from_description(desc) == "NoonDalton"
    assert extract_person_from_description(desc)[0] == "Edward Dalton"


def test_italian_labels_multiline():
    desc = "Azienda: NoonDalton\nContatto: Edward Dalton"
    assert extract_company_from_description(desc) == "NoonDalton"
    assert extract_person_from_description(desc)[0] == "Edward Dalton"


def test_spanish_labels_same_line():
    desc = "Empresa: Acme Corp Contacto: Ana García"
    assert extract_company_from_description(desc) == "Acme Corp"
    assert extract_person_from_description(desc)[0] == "Ana García"


def test_business_signals_detect_italian():
    reunion = {
        "tema": "Reunion NoonDalton",
        "descripcion": "Azienda: NoonDalton Contatto: Edward Dalton",
    }
    assert has_business_meeting_signals(reunion) is True
    parsed = parse_calendar_event_for_dossiers(reunion)
    assert parsed["company_corporate"] == "NoonDalton"
    assert parsed["person_name"] == "Edward Dalton"
