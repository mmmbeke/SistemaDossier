"""
Generación de dossiers desde eventos de calendario.

- **Empresa**: LangGraph corporativo → Companies House + SEC Edgar.
  Se detecta en el asunto; si no hay señal clara, en la descripción («Empresa: …»).
- **Persona** (descripción del evento): Lusha + Gemini.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from dossier.db.models import Dossier
from dossier.graphs.corporate_dossier_graph import JurisdictionScope, run_corporate_dossier_langgraph
from dossier.schemas.person_research import PersonResearchRequest, PersonResearchSource
from dossier.services.corporate_company_search import find_companies_house_matches, find_sec_matches
from dossier.services.person_research_service import run_person_research

logger = logging.getLogger(__name__)

_SUBJECT_PREFIX = re.compile(
    r"^(?:reunión|reunion|demo|llamada|call|meeting|segunda\s+reunión|primera\s+llamada)\s*"
    r"(?:comercial|producto|estratégica|estadategica|con|de)\s*[-–—:]\s*",
    re.IGNORECASE,
)

_SUBJECT_WITH = re.compile(
    r"(?i)^(?:reunión|reunion|demo|llamada|call|meeting)\s+(?:comercial|estratégica|estadategica|producto|con|de)\s+(.+)$"
)

_SUBJECT_CON = re.compile(r"(?i)^(?:reunión|reunion|meeting|call)\s+con\s+(.+)$")

_EMPRESA_DESC = re.compile(
    r"(?i)(?:empresa|company|cliente|client|organización|organization|organizacion):\s*(.+?)(?:\n|$)"
)

_GENERIC_MEETING_TITLE = re.compile(
    r"(?i)^(?:reunión|reunion|meeting|call|llamada|demo|sync|standup|stand-up|daily|weekly|"
    r"kickoff|kick-off|1:1|one-on-one|catch-up|catchup|review|planning|genérico|generico)"
    r"(?:\s+(?:semanal|diaria|de\s+equipo|interna|internal|team))?\s*$"
)

_PERSON_PATTERNS = (
    re.compile(r"(?i)contacto:\s*(.+?)(?:\n|$)"),
    re.compile(r"(?i)reunión con\s+(.+?)(?:\n|$)"),
    re.compile(r"(?i)meeting with\s+(.+?)(?:\n|$)"),
)

_JOB_IN_DESC = re.compile(r"(?i)(?:cargo|puesto|rol|título|titulo|área|area):\s*(.+?)(?:\n|$)")

_COUNTRY_IN_DESC = re.compile(
    r"(?i)(?:país|pais|country)(?:\s*\([^)]*\))?\s*:\s*(.+?)(?:\n|$)"
)

_OPTIONAL_FIELD_PLACEHOLDERS = frozenset(
    {
        "(país)",
        "(pais)",
        "(country)",
        "país",
        "pais",
        "country",
        "—",
        "-",
        "...",
        "n/a",
        "na",
        "s/n",
        "sin especificar",
    }
)


def _clean_optional_field(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip().rstrip(".")
    if len(v) < 2:
        return None
    if v.lower() in _OPTIONAL_FIELD_PLACEHOLDERS:
        return None
    if v.startswith("(") and v.endswith(")"):
        return None
    return v


def extract_company_from_subject(tema: str) -> str:
    """Empresa en el asunto (p. ej. «Reunión comercial — Tesla Inc» o «Reunión con Tesla»)."""
    t = (tema or "").strip()
    if not t:
        return ""

    for sep in ("—", "–", " - ", ":"):
        if sep in t:
            parts = [p.strip() for p in t.split(sep) if p.strip()]
            if len(parts) >= 2:
                tail = parts[-1]
                if len(tail) >= 2:
                    return tail

    for pat in (_SUBJECT_WITH, _SUBJECT_CON):
        m = pat.match(t)
        if m:
            name = m.group(1).strip()
            if len(name) >= 2:
                return name

    cleaned = _SUBJECT_PREFIX.sub("", t).strip()
    return cleaned or t


def extract_company_from_description(descripcion: str) -> str:
    """Empresa en la descripción: «Empresa: …», «Company: …», etc."""
    d = (descripcion or "").strip()
    if not d:
        return ""

    m = _EMPRESA_DESC.search(d)
    if m:
        name = m.group(1).strip().rstrip(".")
        if len(name) >= 2:
            return name

    for line in d.splitlines():
        line = line.strip()
        if not line:
            continue
        extracted = extract_company_from_subject(line)
        if extracted and _subject_yields_company(line, extracted):
            return extracted

    return ""


def _subject_yields_company(tema: str, extracted: str) -> bool:
    """True si el asunto aporta un nombre de empresa (no solo el título genérico entero)."""
    if not extracted or len(extracted.strip()) < 2:
        return False
    t = (tema or "").strip().lower()
    e = extracted.strip().lower()
    if e == t:
        return False
    if _GENERIC_MEETING_TITLE.match(extracted.strip()):
        return False
    return True


def resolve_corporate_company(tema: str, descripcion: str) -> tuple[str, str]:
    """
    Empresa para dossier corporativo: primero asunto; si no hay señal clara, descripción.
    Devuelve (nombre, origen: subject|description|"").
    """
    from_subject = extract_company_from_subject(tema)
    from_description = extract_company_from_description(descripcion)

    if _subject_yields_company(tema, from_subject):
        return from_subject.strip(), "subject"
    if from_description:
        return from_description.strip(), "description"
    if from_subject.strip():
        return from_subject.strip(), "subject"
    return "", ""


def extract_person_from_description(descripcion: str) -> tuple[str, str | None, str | None]:
    """
    Contacto, cargo y país opcional en la descripción.

    Formato recomendado (una línea por campo)::

        Empresa: SpaceX
        Contacto: Elon Musk
        Cargo: CEO
        País (opcional): Estados Unidos
    """
    d = (descripcion or "").strip()
    if not d:
        return "", None, None

    name = ""
    job: str | None = None
    country: str | None = None

    jm = _JOB_IN_DESC.search(d)
    if jm:
        job = _clean_optional_field(jm.group(1))

    cm = _COUNTRY_IN_DESC.search(d)
    if cm:
        country = _clean_optional_field(cm.group(1))

    for pat in _PERSON_PATTERNS:
        m = pat.search(d)
        if m:
            chunk = m.group(1).strip().rstrip(".")
            if "," in chunk and not job:
                name, rest = chunk.split(",", 1)
                name = name.strip()
                job = _clean_optional_field(rest)
            else:
                name = chunk
            break

    return name, job, country


def parse_calendar_event_for_dossiers(reunion: dict[str, Any]) -> dict[str, Any]:
    tema = (reunion.get("tema") or "").strip()
    descripcion = (reunion.get("descripcion") or "").strip()
    participantes = (reunion.get("participantes") or "").strip()
    company_subject = extract_company_from_subject(tema)
    company_corporate, company_corporate_source = resolve_corporate_company(tema, descripcion)
    company_person = extract_company_from_description(descripcion) or company_corporate or company_subject
    person_name, person_job, person_country = extract_person_from_description(descripcion)
    return {
        "company": company_corporate,
        "company_subject": company_subject,
        "company_corporate": company_corporate,
        "company_corporate_source": company_corporate_source,
        "company_person": company_person,
        "person_name": person_name,
        "person_job": person_job,
        "person_country": person_country,
        "tema": tema,
        "descripcion": descripcion,
        "participantes": participantes,
    }


def resolve_corporate_brief(company_query: str) -> tuple[str, JurisdictionScope]:
    """
    Resuelve empresa en registro UK o SEC antes del LangGraph (evita homónimos y briefs ambiguos).
    """
    q = (company_query or "").strip()
    if len(q) < 2:
        return q, "dual"

    us_hits = find_sec_matches(q, limit=5)
    if us_hits:
        h = us_hits[0]
        title = h.get("title") or q
        ticker = h.get("ticker") or ""
        cik = h.get("cik") or ""
        brief = (
            f"{title} — Estados Unidos, emisor SEC (ticker {ticker}, CIK {cik}). "
            f"Petición del usuario (término buscado): «{q}»."
        )
        return brief, "us_only"

    uk_hits, _ = find_companies_house_matches(q, limit=5)
    if uk_hits:
        h = uk_hits[0]
        title = h.get("title") or q
        cn = h.get("company_number") or ""
        brief = (
            f"{title} — Reino Unido, empresa registrada en Companies House "
            f"(número {cn}). Petición del usuario (término buscado): «{q}»."
        )
        return brief, "uk_only"

    return q, "dual"


def generate_dossiers_from_calendar_event(
    reunion: dict[str, Any],
    *,
    organization_context_block: str | None = None,
) -> dict[str, Any]:
    """
    Devuelve dossiers corporativo (CH/SEC) y de persona (Lusha) por separado.
    """
    parsed = parse_calendar_event_for_dossiers(reunion)
    company_corporate = parsed["company_corporate"]
    company_person = parsed["company_person"]
    person_name = parsed["person_name"]
    person_job = parsed["person_job"]
    person_country = parsed.get("person_country")
    tema = parsed["tema"]
    participantes = parsed["participantes"]

    corporate_md: str | None = None
    person_md: str | None = None
    person_payload: dict[str, Any] | None = None
    errors: list[str] = []

    if company_corporate or participantes:
        try:
            participantes_brief, scope = resolve_corporate_brief(company_corporate)
            if participantes:
                participantes_brief = f"{participantes_brief} Asistentes: {participantes}"
            corporate_md = run_corporate_dossier_langgraph(
                tema_reunion=tema or "Reunión",
                participantes=participantes_brief,
                descripcion="",
                jurisdiction_scope=scope,
            )
        except Exception as e:
            logger.exception("Fallo dossier corporativo desde calendario")
            errors.append(f"Corporativo: {e}")
            corporate_md = f"# Error en dossier corporativo\n\n{e}"

    if person_name and len(person_name) >= 2:
        try:
            req = PersonResearchRequest(
                full_name=person_name,
                company=company_person or None,
                job_area=person_job,
                country=person_country,
                research_source=PersonResearchSource.lusha,
                max_profiles=1,
            )
            person_payload = run_person_research(
                req,
                organization_context_block=organization_context_block,
            )
            person_md = (person_payload.get("gemini_analysis_markdown") or "").strip() or None
        except Exception as e:
            logger.exception("Fallo dossier persona (Lusha) desde calendario")
            errors.append(f"Persona: {e}")
            person_md = f"# Error en dossier persona\n\n{e}"

    if not corporate_md and not person_md:
        corporate_md = (
            "No se pudo generar ningún dossier. "
            "Usa este formato en la descripción del evento:\n\n"
            "**Asunto:** Kick-off proyecto Q3\n\n"
            "**Descripción:**\n"
            "Empresa: SpaceX\n"
            "Contacto: Elon Musk\n"
            "Cargo: CEO\n"
            "País (opcional): Estados Unidos"
        )

    return {
        "reunion": reunion,
        "parse": parsed,
        "dossier_corporativo": corporate_md,
        "dossier_persona": person_md,
        "dossier_persona_research": person_payload,
        "dossier_generado": corporate_md or person_md or "",
        "errors": errors,
    }


def _markdown_is_persistable(md: str | None) -> bool:
    if not md or not md.strip():
        return False
    s = md.lstrip()
    if s.startswith("# Error"):
        return False
    if s.startswith("No se pudo generar ningún dossier"):
        return False
    return True


def _format_meeting_datetime(inicio: str | None) -> str:
    if not inicio:
        return ""
    raw = inicio.strip()
    try:
        normalized = raw.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt.strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return raw[:16]


def build_calendar_meeting_label(reunion: dict[str, Any]) -> str:
    """Etiqueta legible de la reunión (asunto + fecha/hora)."""
    tema = (reunion.get("tema") or "").strip() or "Reunión"
    when = _format_meeting_datetime(reunion.get("inicio"))
    if when:
        return f"{tema} · {when}"
    return tema


def _calendar_meta(reunion: dict[str, Any], provider: str) -> dict[str, Any]:
    meeting_label = build_calendar_meeting_label(reunion)
    return {
        "provider": provider,
        "external_event_id": reunion.get("id"),
        "tema": reunion.get("tema"),
        "inicio": reunion.get("inicio"),
        "fin": reunion.get("fin"),
        "participantes": reunion.get("participantes"),
        "meeting_label": meeting_label,
    }


def calendar_meeting_summary_from_dossier_data(
    dossier_data: dict[str, Any] | None,
    *,
    trigger_source: str | None = None,
) -> str | None:
    """Etiqueta de reunión para listados (nuevos y dossiers ya guardados)."""
    if (trigger_source or "").strip() != "calendar":
        return None
    data = dossier_data if isinstance(dossier_data, dict) else {}
    cal = data.get("calendar")
    if not isinstance(cal, dict):
        return None
    label = cal.get("meeting_label")
    if isinstance(label, str) and label.strip():
        return label.strip()[:255]
    reunion = {
        "tema": cal.get("tema"),
        "inicio": cal.get("inicio"),
    }
    built = build_calendar_meeting_label(reunion)
    return built[:255] if built else None


def persist_calendar_dossiers(
    db: Session,
    *,
    user_id: UUID,
    org_id: UUID,
    result: dict[str, Any],
    calendar_provider: str,
    generation_duration_ms: int,
    calendar_event_id: UUID | None = None,
) -> dict[str, Any]:
    """
    Guarda dossier corporativo y/o persona en ``dossiers`` (Mis Dossiers).
    """
    parsed = result.get("parse") or {}
    reunion = result.get("reunion") or {}
    cal = _calendar_meta(reunion, calendar_provider)
    now = datetime.now(timezone.utc)
    saved: dict[str, Any] = {}
    folder_id = uuid.uuid4()
    folder_title = (
        cal.get("meeting_label")
        or (parsed.get("tema") or "").strip()
        or (parsed.get("company_corporate") or "").strip()
        or "Reunión"
    )[:255]
    calendar_folder = {"id": str(folder_id), "title": folder_title}

    corporate_md = result.get("dossier_corporativo")
    if _markdown_is_persistable(corporate_md):
        is_err = str(corporate_md).lstrip().startswith("# Error")
        status = "failed" if is_err else "complete"
        dossier_id = uuid.uuid4()
        subject = (parsed.get("company_corporate") or parsed.get("company") or parsed.get("tema") or "Empresa")[:255]
        dossier = Dossier(
            id=dossier_id,
            organization_id=org_id,
            requested_by_user_id=user_id,
            contact_id=None,
            subject_name=subject,
            subject_email=None,
            module_identity=False,
            module_corporate=True,
            module_media=False,
            depth_level="standard",
            credits_consumed=0,
            status=status,
            status_message="Error en el informe generado." if is_err else None,
            dossier_data={
                "format": "markdown",
                "body": corporate_md,
                "pipeline": "langgraph_corporate",
                "success": not is_err,
                "billing": "none",
                "calendar": cal,
                "calendar_folder": calendar_folder,
                "calendar_folder_role": "corporate",
            },
            agents_activated=["agent_corporate_uk", "agent_corporate_usa", "synthesize_gemini"],
            agents_failed=(["synthesize_gemini"] if is_err else []),
            data_sources_used=["companies_house", "sec_edgar", "sec_company_facts", "gemini"],
            generation_started_at=now,
            generation_completed_at=now,
            generation_duration_ms=generation_duration_ms,
            trigger_source="calendar",
            calendar_event_id=calendar_event_id,
            dossier_folder_id=folder_id,
        )
        db.add(dossier)
        saved["corporate"] = {
            "id": str(dossier_id),
            "status": status,
            "subject_name": subject,
        }
        saved["folder"] = {"id": str(folder_id), "title": folder_title}

    person_md = result.get("dossier_persona")
    if _markdown_is_persistable(person_md):
        is_err = str(person_md).lstrip().startswith("# Error")
        status = "failed" if is_err else "complete"
        dossier_id = uuid.uuid4()
        person_name = (parsed.get("person_name") or "Contacto")[:255]
        dossier = Dossier(
            id=dossier_id,
            organization_id=org_id,
            requested_by_user_id=user_id,
            contact_id=None,
            subject_name=person_name,
            subject_email=None,
            module_identity=True,
            module_corporate=False,
            module_media=False,
            depth_level="standard",
            credits_consumed=0,
            status=status,
            status_message="Error en el informe generado." if is_err else None,
            dossier_data={
                "format": "markdown",
                "body": person_md,
                "pipeline": "person_research",
                "success": not is_err,
                "billing": "none",
                "calendar": cal,
                "calendar_folder": calendar_folder,
                "calendar_folder_role": "person",
                "person_filters": {
                    "full_name": parsed.get("person_name"),
                    "job_area": parsed.get("person_job"),
                    "company": parsed.get("company_person"),
                    "country": parsed.get("person_country"),
                    "research_source": "lusha",
                },
            },
            agents_activated=[],
            agents_failed=[],
            data_sources_used=["lusha", "gemini"],
            generation_started_at=now,
            generation_completed_at=now,
            generation_duration_ms=generation_duration_ms,
            trigger_source="calendar",
            calendar_event_id=calendar_event_id,
            dossier_folder_id=folder_id,
        )
        db.add(dossier)
        saved["person"] = {
            "id": str(dossier_id),
            "status": status,
            "subject_name": person_name,
        }
        if "folder" not in saved:
            saved["folder"] = {"id": str(folder_id), "title": folder_title}

    if saved:
        db.commit()

    result["saved_dossiers"] = saved
    return result
