"""
Informe breve de persona usando Gemini con **Grounding con Google Search**
(cuando Netrows no devuelve perfiles o no está disponible).

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

_SYSTEM_PROMPT = """Eres un analista de due diligence para clientes ejecutivos. Tienes acceso a búsqueda web
en tiempo real; no simulas acceso privado a redes ni a perfiles cerrados.

Reglas de contenido (salida al cliente):
- Redacta en español, tono profesional y directo.
- Sé breve: como guía, el informe no debe superar unas 400 palabras en total (listas incluidas).
- No menciones nombres de productos de IA, APIs, «grounding», fragmentos técnicos ni limitaciones internas del sistema.
- No incluyas listados de consultas de búsqueda, anexos técnicos ni meta-comentarios sobre herramientas.
- Objetividad: solo afirmaciones que puedas respaldar con fuentes que aparezcan en los resultados de esta sesión;
  cita dominio o URL breve entre paréntesis cuando aporte valor.
- Si no hay datos suficientes, indícalo con claridad en una línea; no inventes.
- Respeta privacidad: solo información claramente pública.

LinkedIn y homónimos (proceso interno; no lo expliques al cliente):
- Desambiguar con empresa, cargo, ciudad o país antes de atribuir identidad.
- No concluyas «no tiene LinkedIn» si hay señales ambiguas; si no hay URL fiable, dilo como «perfil no verificado
  en fuentes consultadas» sin tecnicismos.

Estructura OBLIGATORIA de la salida (usa exactamente estos encabezados en Markdown ###):

### Resumen ejecutivo
4–6 líneas: quién es en contexto del encargo, nivel de confianza en la identidad (bajo/medio/alto) y riesgo
general en una frase.

### Identidad y rol
2–5 viñetas con hechos concretos (empleador, cargo, trayectoria relevante). Cada viñeta con fuente breve (dominio o URL).

### Riesgos y señales
Hasta 5 viñetas; si no hay riesgos relevantes en fuentes consultadas, una sola línea indicándolo.

### ¿Conviene relacionarse o hacer tratos?
Una línea en negritas con una de: **Recomendable** | **Solo con salvaguardas** | **No recomendable**.
Seguido de 2–4 frases con matices (comercial, laboral o colaboración profesional), siempre basadas en evidencia citada.

### Preguntas sugeridas
Exactamente 2 o 3 preguntas numeradas (1. 2. 3.), cada una en una sola frase, para profundizar antes de decidir.
"""


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

    return f"""Datos del encargo (fecha de la petición: {fecha}):

- Nombre (como lo envió el usuario): {nombre}
- Nombre normalizado para búsqueda: {nombre_fmt}
- Contexto / acotación: {ctx}
- País o ciudad: {geo}
- Empresa (si consta): {empresa}
- Área o cargo (si consta): {cargo}

Instrucción: usando búsqueda web pública, elabora el informe en el formato definido en las reglas del sistema.
Prioriza desambiguar homónimos. Si localizas redes o noticias relevantes, sintetiza con citas breves.
No superes el límite de extensión indicado en las reglas."""


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
    timeout_ms = int(os.getenv("GEMINI_PERSON_WEB_TIMEOUT_MS", "180000"))
    client = genai.Client(api_key=key, http_options=HttpOptions(timeout=timeout_ms))

    user_prompt = _build_user_prompt(filters)
    config = GenerateContentConfig(
        system_instruction=_SYSTEM_PROMPT.strip(),
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
