"""Utilidades compartidas del proveedor LLM (DeepSeek)."""
from __future__ import annotations

import re

EMPTY_PERSON_REPORT_MARKERS: frozenset[str] = frozenset(
    {
        "(No se generó texto de informe tras la búsqueda.)",
        "(Gemini devolvió texto vacío.)",
        "(DeepSeek devolvió texto vacío.)",
    }
)


def normalize_person_report_text(text: str | None) -> str | None:
    """None si el informe está vacío o es un marcador de fallo silencioso."""
    if not text or not text.strip():
        return None
    t = text.strip()
    if t in EMPTY_PERSON_REPORT_MARKERS:
        return None
    return t


def is_rate_limit_error(exc: BaseException) -> bool:
    s = str(exc).lower()
    return (
        "429" in s
        or "resource exhausted" in s
        or ("quota" in s and "exceed" in s)
        or "rate limit" in s
        or "too many requests" in s
    )


def is_transient_server_error(exc: BaseException) -> bool:
    s = str(exc).lower()
    return (
        "503" in s
        or "502" in s
        or "504" in s
        or "unavailable" in s
        or "timed out" in s
        or "timeout" in s
        or "deadline" in s
        or "try again" in s
    )


def should_retry(exc: BaseException) -> bool:
    s = str(exc).lower()
    if "api key" in s and "invalid" in s:
        return False
    if "401" in s or "403" in s or "invalid_argument" in s:
        return False
    return is_rate_limit_error(exc) or is_transient_server_error(exc)


def retry_after_seconds(exc: BaseException) -> float:
    msg = str(exc)
    m = re.search(r"please retry in ([\d.]+)s", msg, re.I)
    if m:
        return min(float(m.group(1)) + 2.0, 120.0)
    m2 = re.search(r"seconds:\s*(\d+)", msg)
    if m2:
        return min(float(m2.group(1)) + 2.0, 120.0)
    if is_transient_server_error(exc):
        return 25.0
    return 35.0
