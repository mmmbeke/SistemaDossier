"""Etiquetas de campos en eventos de calendario (es, en, pt, it, fr, de)."""
from __future__ import annotations

import re

# Idiomas de interfaz / salida de dossiers de la plataforma.
COMPANY_LABELS: tuple[str, ...] = (
    "empresa",
    "company",
    "compañía",
    "compania",
    "compañia",
    "cliente",
    "client",
    "organización",
    "organizacion",
    "organization",
    "organização",
    "organizacao",
    "entreprise",
    "société",
    "societe",
    "azienda",
    "impresa",
    "società",
    "societa",
    "unternehmen",
    "firma",
    "kunde",
)

PERSON_LABELS: tuple[str, ...] = (
    "contacto",
    "contact",
    "nombre",
    "name",
    "nome",
    "nom",
    "contatto",
    "kontakt",
)

JOB_LABELS: tuple[str, ...] = (
    "cargo",
    "puesto",
    "rol",
    "role",
    "rolle",
    "título",
    "titulo",
    "title",
    "job",
    "position",
    "poste",
    "fonction",
    "ruolo",
    "carica",
    "posizione",
    "função",
    "funcao",
    "papel",
    "stelle",
    "bereich",
    "área",
    "area",
)

COUNTRY_LABELS: tuple[str, ...] = (
    "país",
    "pais",
    "country",
    "pays",
    "paese",
    "land",
)

EMAIL_LABELS: tuple[str, ...] = (
    "email",
    "e-mail",
    "correo",
    "correio",
    "mail",
    "courriel",
)

MEETING_WITH_SUBJECT_PHRASES: tuple[str, ...] = (
    "reunión con",
    "reunion con",
    "meeting with",
    "reunião com",
    "reuniao com",
    "riunione con",
    "incontro con",
    "réunion avec",
    "reunion avec",
    "rendez-vous avec",
    "meeting mit",
    "besprechung mit",
    "termin mit",
)


def _alt(*terms: str) -> str:
    unique: list[str] = []
    seen: set[str] = set()
    for term in terms:
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(re.escape(term))
    return "|".join(unique)


def labeled_field_pattern(labels: tuple[str, ...]) -> re.Pattern[str]:
    return re.compile(rf"(?i)(?:{_alt(*labels)})\s*:\s*(.+?)(?:\n|$)")


def numbered_field_pattern(labels: tuple[str, ...]) -> re.Pattern[str]:
    return re.compile(rf"(?i)(?:{_alt(*labels)})\s*(\d+)\s*:\s*(.+?)(?:\n|$)")


def country_field_pattern() -> re.Pattern[str]:
    return re.compile(
        rf"(?i)(?:{_alt(*COUNTRY_LABELS)})(?:\s*\([^)]*\))?\s*:\s*(.+?)(?:\n|$)"
    )


def numbered_country_field_pattern() -> re.Pattern[str]:
    return re.compile(
        rf"(?i)(?:{_alt(*COUNTRY_LABELS)})(?:\s*\([^)]*\))?\s*(\d+)\s*:\s*(.+?)(?:\n|$)"
    )


def email_field_pattern() -> re.Pattern[str]:
    return re.compile(rf"(?i)(?:{_alt(*EMAIL_LABELS)})\s*[:.]\s*(.+?)(?:\n|$)")


def numbered_email_field_pattern() -> re.Pattern[str]:
    return re.compile(rf"(?i)(?:{_alt(*EMAIL_LABELS)})\s*(\d+)\s*[:.]\s*(.+?)(?:\n|$)")


def country_inline_in_job_pattern() -> re.Pattern[str]:
    return re.compile(rf"(?i)\s+(?:{_alt(*COUNTRY_LABELS)})\s*:\s*(.+)$")


def subject_meeting_with_pattern() -> re.Pattern[str]:
    phrases = "|".join(re.escape(p) for p in MEETING_WITH_SUBJECT_PHRASES)
    return re.compile(rf"(?i)^(?:{phrases})\s+(.+)$")


def person_hint_patterns() -> tuple[re.Pattern[str], ...]:
    return (
        labeled_field_pattern(PERSON_LABELS),
        *(
            re.compile(rf"(?i){re.escape(phrase)}\s+(.+?)(?:\n|$)")
            for phrase in MEETING_WITH_SUBJECT_PHRASES
        ),
    )


def business_signal_patterns() -> tuple[re.Pattern[str], ...]:
    return (
        re.compile(rf"(?i)(?:{_alt(*COMPANY_LABELS)})\s*:"),
        re.compile(rf"(?i)(?:{_alt(*PERSON_LABELS)})\s*:"),
    )


def person_hint_regex_source() -> str:
    """Fragmento regex para detectar campos persona (p. ej. tests o frontend)."""
    numbered = rf"(?:{_alt(*PERSON_LABELS)})\s*(?:\d+\s*)?:"
    phrases = "|".join(re.escape(p) for p in MEETING_WITH_SUBJECT_PHRASES)
    return rf"(?:{numbered}|(?:{phrases})\s+)"


# Patrones compilados (uso en calendar_event_dossiers / filters).
EMPRESA_DESC = labeled_field_pattern(COMPANY_LABELS)
PERSON_PATTERNS = person_hint_patterns()
EMAIL_IN_DESC = email_field_pattern()
JOB_IN_DESC = labeled_field_pattern(JOB_LABELS)
COUNTRY_IN_DESC = country_field_pattern()
NUMBERED_CONTACT = numbered_field_pattern(PERSON_LABELS)
NUMBERED_JOB = numbered_field_pattern(JOB_LABELS)
NUMBERED_EMAIL = numbered_email_field_pattern()
NUMBERED_COUNTRY = numbered_country_field_pattern()
SUBJECT_CON = subject_meeting_with_pattern()
COUNTRY_INLINE_IN_JOB = country_inline_in_job_pattern()
