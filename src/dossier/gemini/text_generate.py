"""
Generación de texto con Gemini (sin subir archivos).

Usada por el grafo LangGraph del dossier corporativo (nodo de síntesis).
Reutiliza GEMINI_API_KEY / GEMINI_MODEL del resto del proyecto.
"""
from __future__ import annotations

import os
import time

from dossier.config import load_env
from dossier.gemini.analyze import (
    DEFAULT_MODEL,
    _api_key,
    _retry_after_seconds,
    _should_retry,
)

DEFAULT_TIMEOUT_MS = 120_000


def generate_text_with_gemini(
    prompt: str,
    *,
    model: str | None = None,
    system_instruction: str | None = None,
    max_retries: int = 4,
) -> str:
    """
    Una llamada de texto a Gemini.

    - ``prompt``: instrucciones + contexto (usuario).
    - ``system_instruction``: si el modelo lo admite, va como system prompt.
    """
    load_env()
    key = _api_key()
    if not key:
        raise RuntimeError(
            "Falta GEMINI_API_KEY (o GOOGLE_API_KEY) en .env para la síntesis del dossier."
        )

    from google import genai
    from google.genai.types import GenerateContentConfig, HttpOptions

    m = (model or os.getenv("GEMINI_MODEL") or DEFAULT_MODEL).strip()
    timeout_ms = int(os.getenv("GEMINI_TEXT_TIMEOUT_MS", str(DEFAULT_TIMEOUT_MS)))
    client = genai.Client(
        api_key=key,
        http_options=HttpOptions(timeout=timeout_ms),
    )

    config = None
    if system_instruction and system_instruction.strip():
        config = GenerateContentConfig(system_instruction=system_instruction.strip())

    last_err: BaseException | None = None
    for attempt in range(max(1, max_retries)):
        try:
            response = client.models.generate_content(
                model=m,
                contents=prompt,
                config=config,
            )
            text = getattr(response, "text", None) or ""
            return text.strip() or "(Gemini devolvió texto vacío.)"
        except Exception as e:
            last_err = e
            if attempt < max_retries - 1 and _should_retry(e):
                time.sleep(_retry_after_seconds(e))
                continue
            raise
    if last_err:
        raise last_err
    return ""
