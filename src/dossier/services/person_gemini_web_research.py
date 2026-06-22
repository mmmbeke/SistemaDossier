"""
Informe breve de persona usando Gemini con **Grounding con Google Search**
(cuando Lusha no devuelve perfiles o no está disponible).

Requiere GEMINI_API_KEY / GOOGLE_API_KEY y un modelo que admita la herramienta
`google_search` (p. ej. gemini-2.5-flash). Facturación según política de Google.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any

from dossier.config import load_env
from dossier.gemini.analyze import DEFAULT_MODEL, _api_key, _retry_after_seconds, _should_retry
from dossier.services.person_analysis_prompts import PERSON_EXHAUSTIVE_SYSTEM_PROMPT


def _fv(filters: dict[str, Any], key: str, default: str = "No indicado") -> str:
    v = filters.get(key)
    if v is None:
        return default
    s = str(v).strip()
    return s if s else default


def _geo_line(filters: dict[str, Any]) -> str:
    country = (filters.get("country") or "").strip()
    city = (filters.get("city") or "").strip()
    if not country and not city:
        return "No indicado"
    if city and country:
        return f"{city}, {country}"
    return city or country


def _name_title_case_words(name: str) -> str:
    """Mayúsculas iniciales por palabra (p. ej. victor escobar jeria → Victor Escobar Jeria)."""
    return " ".join((w[:1].upper() + w[1:].lower()) if w else "" for w in name.split())


def _context_line(filters: dict[str, Any]) -> str:
    parts: list[str] = []
    org = _fv(filters, "contexto_organizacion_cliente", "")
    if org != "No indicado":
        parts.append(f"Contexto organización/cliente: {org}")
    extra = _fv(filters, "extra_keywords", "")
    if extra != "No indicado":
        parts.append(f"Palabras clave / motivo de investigación: {extra}")
    if not parts:
        return "No indicado"
    return " | ".join(parts)


def _build_user_prompt(filters: dict[str, Any]) -> str:
    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    nombre = _fv(filters, "full_name")
    nombre_fmt = _name_title_case_words(nombre)
    empresa = _fv(filters, "company")
    cargo = _fv(filters, "job_area")
    geo = _geo_line(filters)
    ctx = _context_line(filters)

    nombre_q = nombre.replace('"', "'")
    nombre_fmt_q = nombre_fmt.replace('"', "'")
    emp_tail = empresa if empresa != "No indicado" else ""
    cargo_tail = cargo if cargo != "No indicado" else ""
    geo_tail = geo if geo != "No indicado" else ""

    return f"""Datos del encargo (fecha: {fecha}):

- Nombre: {nombre} (búsqueda sugerida: {nombre_fmt})
- Contexto: {ctx}
- País/ciudad: {geo}
- Empresa: {empresa}
- Cargo/área: {cargo}

---

## Fase de recopilación (usa búsqueda web; no la listes en el informe final)

Antes de redactar, consulta fuentes públicas variadas para desambiguar homónimos. Como mínimo explora variantes de:
- LinkedIn y trayectoria: `{nombre_fmt_q}` linkedin {emp_tail} {cargo_tail}
- Noticias y menciones: `"{nombre_fmt_q}"` noticias entrevista {emp_tail}
- Redes y presencia: X/Twitter, Instagram u otras si son relevantes al cargo
- Riesgo reputacional prudente: `"{nombre_fmt_q}"` demanda fraude (solo reportar si aparece en resultados; sin presumir culpabilidad)

Prioriza resultados que encajen con empresa, cargo o ubicación indicados.

---

## Fase de informe

Con lo encontrado, redacta el informe **exhaustivo** en el formato del sistema. Profundiza en:
- Inconsistencias entre puestos, fechas, empresas o proyectos.
- Publicaciones o situaciones públicas que llamen la atención.
- Análisis integrado de la persona y recomendaciones accionables.
- Si conviene relacionarse o hacer tratos (Recomendable / Solo con salvaguardas / No recomendable).

No incluyas en la salida el inventario de búsquedas realizadas."""


def analyze_person_with_google_search(
    *,
    filters: dict[str, Any],
    model: str | None = None,
    max_retries: int = 3,
) -> str:
    """
    Una llamada a Gemini con herramienta Google Search (grounding).
    """
    load_env()
    key = _api_key()
    if not key:
        raise RuntimeError(
            "Falta GEMINI_API_KEY (o GOOGLE_API_KEY) en .env para el informe con búsqueda web."
        )

    if (os.getenv("GEMINI_DISABLE_GOOGLE_SEARCH") or "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        raise RuntimeError(
            "La búsqueda web con Gemini está desactivada (GEMINI_DISABLE_GOOGLE_SEARCH=1)."
        )

    from google import genai
    from google.genai.types import GenerateContentConfig, GoogleSearch, HttpOptions, Tool

    m = (model or os.getenv("GEMINI_PERSON_WEB_MODEL") or os.getenv("GEMINI_MODEL") or DEFAULT_MODEL).strip()
    timeout_ms = int(os.getenv("GEMINI_PERSON_WEB_TIMEOUT_MS", "240000"))
    client = genai.Client(api_key=key, http_options=HttpOptions(timeout=timeout_ms))

    user_prompt = _build_user_prompt(filters)
    config = GenerateContentConfig(
        system_instruction=PERSON_EXHAUSTIVE_SYSTEM_PROMPT.strip(),
        tools=[Tool(google_search=GoogleSearch())],
    )

    last_err: BaseException | None = None
    for attempt in range(max(1, max_retries)):
        try:
            response = client.models.generate_content(
                model=m,
                contents=user_prompt,
                config=config,
            )
            text = getattr(response, "text", None) or ""
            out = text.strip()
            return out or "(No se generó texto de informe tras la búsqueda.)"
        except Exception as e:
            last_err = e
            if attempt < max_retries - 1 and _should_retry(e):
                time.sleep(_retry_after_seconds(e))
                continue
            raise
    if last_err:
        raise last_err
    return ""
