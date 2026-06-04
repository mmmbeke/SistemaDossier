"""
Informe OSINT de persona usando Gemini con **Grounding con Google Search**
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

_SYSTEM_PROMPT = """Actúa como investigador experto en due diligence, análisis de riesgo reputacional y
verificación de antecedentes. Dispones de búsqueda web en tiempo real (Google Search grounding), no de
navegación iniciada sesión en redes privadas.

Reglas estrictas:
- Objetividad y hechos verificables: cita dominio o URL de cada hallazgo relevante.
- Si una fuente no aparece en los resultados de esta sesión, dilo; no simules haber consultado sitios que la
  herramienta no devolvió.
- No inventes datos para cumplir plantillas: mejor gaps honestos que suposiciones.
- Respeta privacidad: solo información claramente pública.
- Redacta en español salvo que el mensaje de usuario pida otro idioma.

LinkedIn y límites técnicos:
- No confundas «no apareció en resultados» con «no existe perfil». LinkedIn indexa de forma parcial; nunca
  concluyas categóricamente que la persona carece de LinkedIn.
- No afirmes acceso «directo» al interior del perfil como usuario logueado: trabajas con fragmentos públicos
  y enlaces que la búsqueda devuelva.
- Prioriza desambiguar homónimos (empresa, ciudad, país, sector) antes de atribuir identidad.

Consistencia con Google en navegador:
- La herramienta de búsqueda integrada en la API **puede no coincidir** en ranking ni en snippets con
  google.com abierto manualmente. Si tras muchas variantes no ves linkedin.com/in pero el caso es sensible,
  indica explícitamente esa limitación y pide verificación manual en el buscador (no insinúes que el perfil
  no existe).
- No te limites al «primer resultado»: cualquier URL `linkedin.com/...` en snippets, universidades, noticias
  o Knowledge Graph cuenta como hallazgo; cítala.

Extracción tipo «Gemini en chat»:
- Cuando la búsqueda devuelva resultados de LinkedIn (enlace, título «Nombre — Empresa», líneas de snippet,
  seguidores, formación), **transcribe y sintetiza** esa información en el informe como presencia en LinkedIn.
- Nunca resumas eso como «no tiene LinkedIn» o «sin perfil» si en los datos de grounding aparece linkedin.com
  o un título claramente asociado a la persona y al contexto (empresa, ciudad, sector).
- **No** incluyas en el informe un anexo ni listado de «consultas realizadas» o cadenas de búsqueda para el usuario."""


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
        parts.append(
            "Palabras clave / motivo de investigación (si el usuario las usó para acotar: candidato, socio, proveedor, sector, etc.): "
            f"{extra}"
        )
    if not parts:
        return "No indicado (puedes inferir solo riesgo genérico si no hay más datos)."
    return " | ".join(parts)


def _build_user_prompt(filters: dict[str, Any]) -> str:
    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    nombre = _fv(filters, "full_name")
    nombre_fmt = _name_title_case_words(nombre)
    empresa = _fv(filters, "company")
    cargo = _fv(filters, "job_area")
    geo = _geo_line(filters)
    ctx = _context_line(filters)

    # Nombre escapado para no romper comillas en el prompt (comillas tipográficas en instrucciones).
    nombre_q = nombre.replace('"', "'")
    nombre_fmt_q = nombre_fmt.replace('"', "'")
    emp_tail = empresa if empresa != "No indicado" else ""
    cargo_tail = cargo if cargo != "No indicado" else ""
    geo_tail = geo if geo != "No indicado" else ""
    emp_linkedin_bullet = (
        f'- `{nombre_fmt_q}` "{emp_tail}" linkedin\n'
        if emp_tail
        else ""
    )

    return f"""Tu misión es realizar una investigación lo más exhaustiva que permita la búsqueda web en esta sesión sobre la siguiente persona.

**NOMBRE COMPLETO (tal como lo envió el usuario):** {nombre}
**MISMO NOMBRE PARA BÚSQUEDAS (capitalización estándar por palabra):** {nombre_fmt}
**CONTEXTO / ACOTACIÓN:** {ctx}
**PAÍS/CIUDAD:** {geo}
**EMPRESA ACTUAL O ANTERIOR (si consta):** {empresa}
**ÁREA O CARGO (si consta):** {cargo}

Fecha de la petición: {fecha}

---

## FASE 0 — CONSULTAS OBLIGATORIAS (ejecútalas como parte del proceso de búsqueda)

**Orden importante para LinkedIn:** muchas veces el grounding responde **mejor** a búsquedas amplias tipo
Google humano que a `site:linkedin.com/in` con el nombre en minúsculas. Ejecuta **todas** las ramas A–C
antes de concluir que no hay URL; usa **{nombre_fmt_q}** en la mayoría de las consultas y **{nombre_q}**
solo como variante adicional si difiere.

**A — LinkedIn primero SIN `site:` (obligatorio):**
- `{nombre_fmt_q}` linkedin
- linkedin `{nombre_fmt_q}`
- `{nombre_fmt_q}` linkedin {emp_tail}
- `{nombre_fmt_q}` linkedin {cargo_tail}
- `{nombre_fmt_q}` linkedin {geo_tail}
{emp_linkedin_bullet}
- (Si `{nombre_q}` ≠ `{nombre_fmt_q}`) repetir al menos dos de las consultas de A sustituyendo el nombre por la variante tal como la escribió el usuario.

**B — LinkedIn con `site:` amplio (antes que `/in`):**
- `site:linkedin.com` "{nombre_fmt_q}"
- `site:linkedin.com` "{nombre_fmt_q}" {emp_tail}

**C — LinkedIn `site:linkedin.com/in` (al final, ambas formas del nombre):**
- `site:linkedin.com/in` "{nombre_fmt_q}"
- `site:linkedin.com/in` "{nombre_q}"
- `site:linkedin.com/in` "{nombre_fmt_q}" {emp_tail}

Si aparece **cualquier** URL `linkedin.com/in/...` o título tipo «Nombre — Empresa» en resultados (aunque
no sea el primer enlace), cópiala al informe y no digas que «no hubo resultados» solo porque no estaba en
la primera posición.

**D — Otras redes** (al menos una consulta por línea que tenga sentido):
   - `"{nombre_fmt_q}" site:twitter.com` o `site:x.com`
   - `"{nombre_fmt_q}" site:instagram.com`
   - `"{nombre_fmt_q}" site:facebook.com`

**E — Profesionales / técnico:** `"{nombre_fmt_q}" site:github.com` y otras plataformas relevantes al cargo.

**F — Noticias y riesgo reputacional:**
   - `"{nombre_fmt_q}"` + términos: noticias, entrevista, demanda, fraude, estafa (solo como búsqueda; no presumas culpabilidad).
   - `"{nombre_fmt_q}"` + nombre de empresa si consta.
   - `"{nombre_fmt_q}" filetype:pdf` (si hay resultados útiles, cítalos).

Si una consulta no devuelve resultados útiles, prueba otra variante (A–C). **No** digas que la persona no tiene LinkedIn sin agotar esas ramas; si sigue sin URL, menciona la posible divergencia con google.com en navegador **solo en el apartado GAPS**, sin listar las consultas ejecutadas.

---

## FASE 1 — IDENTIDAD Y PRESENCIA DIGITAL

1. **LinkedIn:** con lo que devuelva la búsqueda, resume cargo, trayectoria, educación, etc. **solo si consta en fuentes abiertas.** Señala INCONSISTENCIAS visibles (fechas, títulos, empresas dudosas) solo con evidencia en texto o enlaces.
2. **Otras redes:** perfiles encontrados, tono del contenido público, señales de riesgo (con fuente).
3. **Otras plataformas profesionales:** GitHub, ResearchGate, Google Scholar, etc., si aparecen en resultados.

---

## FASE 2 — NOTICIAS Y MENCIONES PÚBLICAS

Sintetiza menciones en medios, blogs corporativos, comunicados. Diferencia hecho verificado de rumor.

---

## FASE 3 — ANTECEDENTES LEGALES Y FINANCIEROS (solo fuentes públicas encontradas)

Demandas, boletines oficiales, insolvencias, sanciones, PEP, registros societarios **solo si aparecen en los resultados de búsqueda**; si no hay nada, dilo explícitamente.

---

## FASE 4 — CONSISTENCIA Y CREDIBILIDAD

Cruza fechas, empresas y ubicaciones. Nivel de confianza en la identidad: BAJO / MEDIO / ALTO y justificación.

---

## FASE 5 — INFORME FINAL (estructura obligatoria)

### 📋 RESUMEN EJECUTIVO
- Identidad confirmada: SÍ / NO / PARCIAL
- Nivel de riesgo general: 🟢 BAJO / 🟡 MEDIO / 🔴 ALTO / ⚫ CRÍTICO (justifica con fuentes)

### 🔎 HALLAZGOS CLAVE
(Ordenados por importancia, cada uno con fuente.)

### ⚠️ SEÑALES DE ALERTA (Red Flags)
(Inconsistencias, noticias negativas, o **información clave no verificable** en esta sesión.)

### ✅ ASPECTOS POSITIVOS VERIFICADOS

### ❓ INFORMACIÓN NO ENCONTRADA / GAPS
(Incluye si no apareció URL de LinkedIn verificable tras A–C; indica si puede deberse a **diferencias entre
esta herramienta de búsqueda y google.com en navegador**; sugiere búsqueda manual concreta, p. ej.
`{nombre_fmt_q}` linkedin o el slug visible en resultados universitarios/prensa.)

### 📊 MATRIZ DE RIESGO (1–10 cada una, con una línea de justificación)
- Riesgo reputacional: [X/10]
- Riesgo legal: [X/10]
- Riesgo financiero: [X/10]
- Riesgo de integridad: [X/10]
- Consistencia del perfil: [X/10]

### 🏁 RECOMENDACIÓN FINAL
CONTRATAR / ASOCIARSE: ✅ Recomendado | ⚠️ Con reservas | ❌ No recomendado — con justificación basada en evidencia.

---

**INSTRUCCIÓN FINAL:** Sé exhaustivo dentro de lo que la herramienta de búsqueda devuelva. Si una fuente (p. ej. Wayback, registro judicial profundo) no está disponible en resultados, indícalo; no inventes hallazgos.
**No incluyas** sección «anexo», «consultas realizadas», listado de queries ni inventario de cadenas de búsqueda: el usuario final no debe ver eso."""


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
            return out or "(Gemini devolvió texto vacío tras la búsqueda web.)"
        except Exception as e:
            last_err = e
            if attempt < max_retries - 1 and _should_retry(e):
                time.sleep(_retry_after_seconds(e))
                continue
            raise
    if last_err:
        raise last_err
    return ""
