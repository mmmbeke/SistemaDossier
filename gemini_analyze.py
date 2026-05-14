"""
Análisis de documentos (HTML, PDF, etc.) con Google Gemini (SDK google-genai).
Requiere GEMINI_API_KEY (Google AI Studio). Opcional: GEMINI_MODEL (p. ej. gemini-2.0-flash-lite).
"""
from __future__ import annotations

import os
import re
import tempfile
import time
from pathlib import Path

from dotenv import load_dotenv

# 1.5-flash ya no está disponible en muchas cuentas/API v1beta (404).
# Ajusta GEMINI_MODEL si necesitas otro (p. ej. gemini-2.0-flash-lite para menos carga).
DEFAULT_MODEL = "gemini-2.5-flash"
MAX_BYTES_WARN = 45 * 1024 * 1024
DEFAULT_MAX_GENERATE_RETRIES = 4
# Timeout HTTP por defecto del SDK suele ser corto; 10-K HTML puede tardar minutos.
DEFAULT_HTTP_TIMEOUT_MS = 900_000


def _api_key() -> str | None:
    load_dotenv()
    for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        k = (os.getenv(name) or "").strip()
        if k:
            return k
    return None


def _is_rate_limit_error(exc: BaseException) -> bool:
    s = str(exc).lower()
    return (
        "429" in s
        or "resource exhausted" in s
        or ("quota" in s and "exceed" in s)
        or "rate limit" in s
    )


def _is_transient_server_error(exc: BaseException) -> bool:
    """503, timeouts y sobrecarga puntual de Google."""
    s = str(exc).lower()
    return (
        "503" in s
        or "unavailable" in s
        or "timed out" in s
        or "timeout" in s
        or "deadline" in s
        or "try again" in s
    )


def _should_retry(exc: BaseException) -> bool:
    return _is_rate_limit_error(exc) or _is_transient_server_error(exc)


def _retry_after_seconds(exc: BaseException) -> float:
    msg = str(exc)
    m = re.search(r"please retry in ([\d.]+)s", msg, re.I)
    if m:
        return min(float(m.group(1)) + 2.0, 120.0)
    m2 = re.search(r"seconds:\s*(\d+)", msg)
    if m2:
        return min(float(m2.group(1)) + 2.0, 120.0)
    if _is_transient_server_error(exc):
        return 25.0
    return 35.0


def _maybe_truncate_document(data: bytes, filename: str) -> tuple[bytes, str]:
    """
    Opcional: GEMINI_MAX_UPLOAD_BYTES (entero) recorta el inicio del archivo para evitar
    timeouts en HTML enormes (p. ej. 10-K). El prompt debe asumir vista parcial.
    """
    raw = (os.getenv("GEMINI_MAX_UPLOAD_BYTES") or "").strip()
    if not raw.isdigit():
        return data, ""
    limit = int(raw)
    if limit <= 0 or len(data) <= limit:
        return data, ""

    cut = data[:limit]
    while cut and (cut[-1] & 0b1100_0000) == 0b1000_0000:
        cut = cut[:-1]

    note = (
        f"\n\n[Nota del sistema: el archivo «{filename}» solo se envió truncado a "
        f"los primeros ~{len(cut) // 1024} KiB por GEMINI_MAX_UPLOAD_BYTES={limit}. "
        "Resume y analiza solo el fragmento visible.]"
    )
    return cut, note


def _is_input_token_limit_error(exc: BaseException) -> bool:
    s = str(exc).lower()
    return "input token count" in s and "exceed" in s


def _token_limit_user_message() -> str:
    return (
        "Gemini rechazó la petición: el documento supera el máximo de tokens de entrada "
        "del modelo (en tu error: 1.048.576). Un 10-K en HTML suele disparar ese límite.\n\n"
        "En el .env define, por ejemplo:\n"
        "  GEMINI_MAX_UPLOAD_BYTES=1000000\n"
        "y vuelve a ejecutar: solo se enviará el inicio del archivo (resumen parcial del "
        "informe). Si aún falla, prueba un valor menor (p. ej. 600000)."
    )


def analyze_document_bytes(
    data: bytes,
    filename: str,
    prompt: str,
    *,
    model: str | None = None,
) -> str:
    """
    Sube el archivo con la Files API, espera estado ACTIVE y genera el análisis.
    """
    if len(data) > MAX_BYTES_WARN:
        raise ValueError(
            f"El archivo supera ~{MAX_BYTES_WARN // (1024 * 1024)} MB; "
            "reduce tamaño o divide el documento."
        )

    key = _api_key()
    if not key:
        raise RuntimeError(
            "Falta GEMINI_API_KEY (o GOOGLE_API_KEY) en el entorno o en el archivo .env."
        )

    from google import genai
    from google.genai.types import FileState, HttpOptions

    timeout_ms = int(os.getenv("GEMINI_HTTP_TIMEOUT_MS", str(DEFAULT_HTTP_TIMEOUT_MS)))
    client = genai.Client(
        api_key=key,
        http_options=HttpOptions(timeout=timeout_ms),
    )
    m = (model or os.getenv("GEMINI_MODEL") or DEFAULT_MODEL).strip()

    data, trunc_note = _maybe_truncate_document(data, filename)
    prompt = prompt + trunc_note

    suffix = Path(filename).suffix or ".html"
    tmp_path: str | None = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        try:
            os.write(fd, data)
        finally:
            os.close(fd)

        uploaded = client.files.upload(file=tmp_path)

        while uploaded.state == FileState.PROCESSING:
            time.sleep(1)
            uploaded = client.files.get(name=uploaded.name)

        if uploaded.state != FileState.ACTIVE:
            raise RuntimeError(
                f"El archivo no quedó listo en Gemini: estado={uploaded.state!r}"
            )

        max_try = int(
            os.getenv("GEMINI_GENERATE_MAX_RETRIES", str(DEFAULT_MAX_GENERATE_RETRIES))
        )
        max_try = max(1, min(max_try, 8))
        response = None
        last_err: BaseException | None = None
        for attempt in range(max_try):
            try:
                response = client.models.generate_content(
                    model=m,
                    contents=[uploaded, prompt],
                )
                break
            except Exception as e:
                last_err = e
                if attempt < max_try - 1 and _should_retry(e):
                    time.sleep(_retry_after_seconds(e))
                    continue
                if _is_input_token_limit_error(e):
                    raise RuntimeError(_token_limit_user_message()) from e
                raise
        if response is None and last_err:
            if _is_input_token_limit_error(last_err):
                raise RuntimeError(_token_limit_user_message()) from last_err
            raise last_err

        text = getattr(response, "text", None) or ""

        try:
            client.files.delete(name=uploaded.name)
        except Exception:
            pass

        return text
    finally:
        if tmp_path and os.path.isfile(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
