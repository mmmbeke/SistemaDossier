"""Compatibilidad: el proyecto usa DeepSeek; estos módulos reexportan la capa LLM."""
from dossier.llm.common import (
    EMPTY_PERSON_REPORT_MARKERS,
    is_transient_server_error,
    normalize_person_report_text,
    retry_after_seconds,
    should_retry,
)
from dossier.llm.document_analyze import analyze_document_bytes

DEFAULT_MODEL = "deepseek-chat"


def gemini_error_should_retry_full_request(exc: BaseException) -> bool:
    return should_retry(exc)


def gemini_error_retry_delay_seconds(exc: BaseException) -> float:
    return retry_after_seconds(exc)


def is_gemini_transient_server_error(exc: BaseException) -> bool:
    return is_transient_server_error(exc)


__all__ = [
    "DEFAULT_MODEL",
    "EMPTY_PERSON_REPORT_MARKERS",
    "analyze_document_bytes",
    "gemini_error_retry_delay_seconds",
    "gemini_error_should_retry_full_request",
    "is_gemini_transient_server_error",
    "normalize_person_report_text",
]
