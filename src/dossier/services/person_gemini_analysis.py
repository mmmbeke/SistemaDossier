"""Análisis narrativo (Gemini) a partir de datos de perfiles públicos — informe breve para cliente."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from dossier.gemini.text_generate import generate_text_with_gemini

_SYSTEM_PROMPT = """Eres un analista de due diligence para clientes ejecutivos. Recibirás un JSON con datos
públicos agregados (perfiles, publicaciones si las hay). Ese JSON es tu única base de hechos verificables.

Reglas:
- Redacta en español, tono profesional y breve (orientación: hasta unas 450 palabras en total).
- No menciones proveedores de datos, APIs, ni nombres de productos de IA.
- Si un hecho no aparece en el JSON, dilo en una línea en la sección correspondiente; no inventes.
- Ausencia de un perfil en el JSON no implica que no exista en la vida real: formulación prudente.
- No incluyas listados técnicos, anexos de campos JSON ni meta-comentarios sobre el formato de entrada.

Estructura OBLIGATORIA de la salida (Markdown, encabezados ### exactos):

### Resumen ejecutivo
4–6 líneas: identidad probable, coherencia del perfil y riesgo general en una frase.

### Identidad y rol
2–5 viñetas con lo más relevante del JSON (cargos, empresas, educación si consta).

### Riesgos y señales
Hasta 5 viñetas (inconsistencias, controversias públicas reflejadas en el JSON). Si no hay, indícalo en una línea.

### ¿Conviene relacionarse o hacer tratos?
Una línea en negritas: **Recomendable** | **Solo con salvaguardas** | **No recomendable**.
2–4 frases de argumento basadas solo en el JSON.

### Preguntas sugeridas
Exactamente 2 o 3 preguntas numeradas, una frase cada una, para profundizar antes de decidir.
"""


def _truncate_json(payload: Any, max_chars: int) -> str:
    raw = json.dumps(payload, ensure_ascii=False, indent=2)
    if len(raw) <= max_chars:
        return raw
    return raw[: max_chars - 80] + "\n\n… [entrada truncada por tamaño] …\n"


def _header_line(filters: dict[str, Any]) -> str:
    name = str(filters.get("full_name") or "").strip() or "No indicado"
    company = str(filters.get("company") or "").strip() or "No indicada"
    country = str(filters.get("country") or "").strip() or "No indicado"
    city = str(filters.get("city") or "").strip()
    if city:
        country = f"{country} — {city}" if country != "No indicado" else city
    return f"{name} / {company} / {country}"


def _build_user_prompt(*, filters: dict[str, Any], bundle_json: str) -> str:
    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    cabecera = _header_line(filters)

    return f"""Persona objeto del encargo: {cabecera}
Fecha del análisis: {fecha}

Genera el informe siguiendo la estructura y reglas del sistema. Usa exclusivamente el siguiente JSON como fuente de hechos:

{bundle_json}
"""


def analyze_person_profile_bundle(
    *,
    filters: dict[str, Any],
    profiles: list[dict[str, Any]],
    posts_by_url: dict[str, Any],
) -> str:
    max_chars = int(os.getenv("GEMINI_PERSON_MAX_JSON_CHARS", "120000"))
    bundle = {
        "criterios_de_busqueda": filters,
        "perfiles": profiles,
        "publicaciones_por_url": posts_by_url or {},
    }
    bundle_json = _truncate_json(bundle, max_chars)
    user_prompt = _build_user_prompt(filters=filters, bundle_json=bundle_json)
    return generate_text_with_gemini(
        user_prompt,
        system_instruction=_SYSTEM_PROMPT,
    )
