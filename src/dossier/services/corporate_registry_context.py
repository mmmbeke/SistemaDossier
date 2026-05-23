"""
Contexto corporativo real para el grafo LangGraph (Companies House + SEC).

Los nodos del grafo llaman aquí para inyectar datos de APIs públicas en el prompt
de síntesis Gemini. Si falla una API o faltan credenciales, se devuelve Markdown
explicativo en lugar de fallar el pipeline entero.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

import requests

from dossier.companies_house.cli import (
    ch_download_filing_document,
    get_company_profile,
    get_filing_history,
)
from dossier.companies_house.prompt_templates import format_ch_filing_gemini_prompt
from dossier.config import load_env
from dossier.gemini.analyze import analyze_document_bytes
from dossier.services.corporate_company_search import (
    find_companies_house_matches,
    find_sec_matches,
)

logger = logging.getLogger(__name__)

SEC_USER_AGENT = "CarlosApp/1.0 (fduran@utem.cl)"


def _ch_filing_gemini_enabled() -> bool:
    """
    Análisis Gemini del primer filing CH (sube archivo + generate_content).

    Desactivar con ``DOSSIER_CORPORATE_CH_FILING_GEMINI=0`` para ahorrar 1 llamada por dossier
    (útil en cuota free tier de Gemini, donde la síntesis final ya consume otra petición).
    """
    load_env()
    v = (os.getenv("DOSSIER_CORPORATE_CH_FILING_GEMINI") or "1").strip().lower()
    return v not in ("0", "false", "no", "off")


def _is_gemini_429_or_quota(exc: BaseException) -> bool:
    s = str(exc).lower()
    return (
        "429" in str(exc)
        or "resource_exhausted" in s
        or ("quota" in s and "exceed" in s)
        or "too many requests" in s
    )


def _gemini_retry_sleep_seconds(exc: BaseException) -> float:
    m = re.search(r"retry in ([\d.]+)s", str(exc), re.IGNORECASE)
    if m:
        return min(float(m.group(1)) + 2.0, 120.0)
    return 58.0


def _analyze_ch_document_with_retries(data: bytes, filename: str, prompt: str) -> str:
    """Reintentos ante 429 / RESOURCE_EXHAUSTED (cuota o ráfaga)."""
    last: BaseException | None = None
    for attempt in range(4):
        try:
            return analyze_document_bytes(data, filename, prompt)
        except Exception as e:
            last = e
            if attempt < 3 and _is_gemini_429_or_quota(e):
                wait = _gemini_retry_sleep_seconds(e)
                logger.info(
                    "Gemini filing CH: 429/cuota, reintento en %.1fs (paso %s/4)",
                    wait,
                    attempt + 2,
                )
                time.sleep(wait)
                continue
            raise
    assert last is not None
    raise last

# Número tras plantilla de resolución (español) del backend.
_RE_CH_NUMBER = re.compile(
    r"Companies House\s*\(\s*número\s+([0-9]{6,10})\s*\)",
    re.IGNORECASE,
)
# Petición original entre comillas latinas « »
_RE_USER_TERM = re.compile(r"«\s*([^»]{2,120})\s*»")

_RE_CIK = re.compile(r"\bCIK\s+(\d{7,10})\b", re.IGNORECASE)
_RE_TICKER = re.compile(r"\bticker\s+([A-Z0-9.]{1,10})\b", re.IGNORECASE)


def _trunc(text: str, max_chars: int = 14_000) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 80] + "\n\n… *(contenido truncado por tamaño)* …\n"


def _ch_auth() -> tuple[str, str] | None:
    load_env()
    key = (os.getenv("COMPANIES_HOUSE_API_KEY") or "").strip()
    if not key:
        return None
    return (key, "")


def _resolve_ch_company_number(participantes: str) -> tuple[str | None, str]:
    """
    Devuelve (company_number, nota de cómo se resolvió) o (None, motivo).
    """
    text = (participantes or "").strip()
    if not text:
        return None, "texto vacío"

    m = _RE_CH_NUMBER.search(text)
    if m:
        return m.group(1).strip(), "número explícito en el brief (Companies House)"

    um = _RE_USER_TERM.search(text)
    if um:
        q = um.group(1).strip()
        if len(q) >= 2 and _ch_auth():
            rows, warns = find_companies_house_matches(q, limit=5)
            if rows:
                return rows[0]["company_number"], f"búsqueda UK por término del usuario «{q}»"
            if warns:
                logger.info("CH search sin resultados para %r: %s", q, warns)

    if _ch_auth() and len(text) >= 3:
        snippet = text[:100].strip()
        rows, _ = find_companies_house_matches(snippet, limit=3)
        if rows:
            return rows[0]["company_number"], "primera coincidencia UK por texto del brief (heurística)"

    return None, "no se pudo deducir número UK (falta clave API, texto o coincidencias)"


def _sec_get_json(url: str) -> dict[str, Any]:
    headers = {"User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip, deflate"}
    r = requests.get(url, headers=headers, timeout=90)
    r.raise_for_status()
    # Buena práctica SEC: espaciar peticiones.
    time.sleep(0.11)
    return r.json()


def _resolve_sec_cik(participantes: str) -> tuple[str | None, str | None, str]:
    """(cik10, ticker opcional, nota)."""
    text = (participantes or "").strip()

    m = _RE_CIK.search(text)
    if m:
        return str(m.group(1)).zfill(10), None, "CIK explícito en el brief"

    tm = _RE_TICKER.search(text)
    if tm:
        t = tm.group(1).upper().replace(".", "")
        hits = find_sec_matches(t, limit=8)
        for h in hits:
            if h.get("ticker", "").upper() == t:
                return h["cik"], h.get("ticker"), f"CIK deducido del ticker {t}"
        if hits:
            h0 = hits[0]
            return h0["cik"], h0.get("ticker"), f"CIK por primera coincidencia SEC para ticker «{t}»"

    um = _RE_USER_TERM.search(text)
    if um:
        q = um.group(1).strip()
        if len(q) >= 2:
            hits = find_sec_matches(q, limit=8)
            if hits:
                h0 = hits[0]
                return h0["cik"], h0.get("ticker"), f"CIK por primera coincidencia SEC para «{q}»"

    if len(text) >= 2:
        hits = find_sec_matches(text[:80], limit=5)
        if hits:
            h0 = hits[0]
            return h0["cik"], h0.get("ticker"), "CIK por heurística sobre primeros caracteres del brief"

    return None, None, "no se pudo deducir CIK/ticker US"


def _format_sec_recent_submissions(data: dict[str, Any], limit: int = 20) -> str:
    name = data.get("name") or "(sin nombre en submissions)"
    cik_header = data.get("cik") or ""
    tickers = data.get("tickers") or []
    recent = (data.get("filings") or {}).get("recent") or {}
    forms = recent.get("form") or []
    dates = recent.get("filingDate") or []
    accs = recent.get("accessionNumber") or []
    lines = [
        "## Datos SEC (submissions JSON)",
        f"- **Nombre en SEC:** {name}",
        f"- **CIK (cabecera):** {cik_header}",
        f"- **Tickers:** {', '.join(str(x) for x in tickers) if tickers else '(no listados)'}",
        "",
        f"### Últimos envíos recientes (hasta {limit} filas)",
        "",
        "| filingDate | form | accessionNumber |",
        "|---|---|---|",
    ]
    n = min(len(forms), len(dates), len(accs), limit)
    for i in range(n):
        lines.append(f"| {dates[i]} | {forms[i]} | {accs[i]} |")
    return "\n".join(lines)


def _ch_gemini_filing_markdown(
    profile: dict[str, Any],
    fh: dict[str, Any],
    auth: tuple[str, str],
    company_number: str,
) -> str:
    """
    Misma lógica que ``maybe_analyze_ch_filing_with_gemini`` en el CLI: primer filing con
    ``document_metadata``, descarga y prompt compartido en ``prompt_templates``.
    """
    load_env()
    if (os.getenv("GEMINI_SKIP_ANALYSIS") or "").strip().lower() in ("1", "true", "yes"):
        return ""

    if not (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip():
        return (
            "\n\n### Análisis del formulario (Gemini)\n\n"
            "*No hay `GEMINI_API_KEY` / `GOOGLE_API_KEY`: se omitió el análisis del documento "
            "(igual que en el CLI sin clave).*\n"
        )

    if not _ch_filing_gemini_enabled():
        return (
            "\n\n### Análisis del formulario (Gemini)\n\n"
            "*Omitido por configuración (`DOSSIER_CORPORATE_CH_FILING_GEMINI=0`): no se envía el "
            "documento a Gemini aquí, para **ahorrar una petición** por dossier. "
            "Sigue activa la síntesis final del informe (otra llamada al modelo).*\n"
        )

    items = fh.get("items") or []
    chosen: tuple[dict[str, Any], str] | None = None
    for item in items:
        meta_url = (item.get("links") or {}).get("document_metadata")
        if meta_url:
            chosen = (item, str(meta_url))
            break

    if not chosen:
        return (
            "\n\n### Análisis del formulario (Gemini)\n\n"
            "*Ningún ítem reciente del historial incluye `document_metadata` descargable "
            "(p. ej. solo presentaciones en papel); no hay archivo para Gemini — mismo criterio que el CLI.*\n"
        )

    item, meta_url = chosen
    company_name = str(profile.get("company_name", "N/A"))
    date = str(item.get("date", ""))
    ftype = str(item.get("type", ""))
    category = str(item.get("category", ""))
    desc = str(item.get("description", ""))
    safe_cn = "".join(c if c.isalnum() else "_" for c in company_number)[:16]

    try:
        data, ext = ch_download_filing_document(meta_url, auth)
        filename = f"ch_{safe_cn}_{date}_{ftype}{ext}"
        prompt = format_ch_filing_gemini_prompt(
            company_name=company_name,
            company_number=company_number,
            date=date,
            ftype=ftype,
            category=category,
            description=desc,
        )
        logger.info("Gemini: analizando primer filing CH %s (%s)", company_number, filename)
        analysis = _analyze_ch_document_with_retries(data, filename, prompt)
        return (
            "\n\n### Análisis del formulario (Companies House — Gemini)\n\n"
            + (analysis.strip() or "(Gemini devolvió texto vacío.)")
            + "\n"
        )
    except Exception as e:
        logger.warning("Gemini CH filing analysis failed: %s", e)
        if _is_gemini_429_or_quota(e):
            return (
                "\n\n### Análisis del formulario (Gemini)\n\n"
                "**Cuota o límite de Gemini (429 / RESOURCE_EXHAUSTED).** En el plan gratuito el "
                "número de peticiones por día y modelo es bajo; este paso usa **una petición** "
                "adicional a la de la síntesis final del dossier.\n\n"
                "- Espera el tiempo que indica Google y vuelve a intentar, o revisa facturación/cuota.\n"
                "- Para generar dossiers **sin** este análisis del documento CH (solo síntesis con "
                "JSON de perfil/historial), pon en `.env`:\n\n"
                "  `DOSSIER_CORPORATE_CH_FILING_GEMINI=0`\n\n"
                f"*Detalle:* `{e}`\n"
            )
        return f"\n\n### Análisis del formulario (Gemini)\n\n*Error al analizar el documento: {e}*\n"


def build_uk_corporate_context_markdown(participantes: str) -> str:
    """Markdown con perfil + muestra de historial Companies House, o mensaje de fallo."""
    auth = _ch_auth()
    if not auth:
        return (
            "## Reino Unido (Companies House)\n\n"
            "*No hay `COMPANIES_HOUSE_API_KEY` en el entorno: no se consultó la API.*\n"
        )

    num, note = _resolve_ch_company_number(participantes)
    if not num:
        return (
            "## Reino Unido (Companies House)\n\n"
            f"*No se obtuvo número de empresa ({note}).*\n\n"
            "**Texto de entrada (extracto):**\n```\n"
            + _trunc(participantes, 2000)
            + "\n```\n"
        )

    try:
        profile = get_company_profile(num, auth)
    except requests.RequestException as e:
        logger.warning("CH profile %s: %s", num, e)
        return f"## Reino Unido (Companies House)\n\n*Error HTTP al leer perfil {num}: {e}*\n"

    try:
        fh = get_filing_history(num, auth)
        items = (fh.get("items") or [])[:10]
        fh_summary = []
        for it in items:
            fh_summary.append(
                {
                    "date": it.get("date"),
                    "type": it.get("type"),
                    "description": it.get("description"),
                }
            )
    except requests.RequestException as e:
        logger.warning("CH filing history %s: %s", num, e)
        fh = {}
        fh_summary = [{"error": str(e)}]

    prof_json = json.dumps(profile, indent=2, ensure_ascii=False)
    fh_json = json.dumps(fh_summary, indent=2, ensure_ascii=False)

    gemini_md = _ch_gemini_filing_markdown(profile, fh, auth, num)

    return (
        "## Reino Unido (Companies House) — datos de API\n\n"
        f"*Empresa resuelta: **{num}** ({note}).*\n\n"
        "### Perfil (JSON)\n\n```json\n"
        + _trunc(prof_json, 10_000)
        + "\n```\n\n"
        "### Muestra de filing history (ítems recientes)\n\n```json\n"
        + _trunc(fh_json, 4000)
        + "\n```\n"
        + gemini_md
    )


def build_us_corporate_context_markdown(participantes: str) -> str:
    """Markdown con submissions SEC recientes, o mensaje de fallo."""
    cik, ticker, note = _resolve_sec_cik(participantes)
    if not cik:
        return (
            "## Estados Unidos (SEC EDGAR)\n\n"
            f"*No se obtuvo CIK ({note}).*\n\n"
            "**Texto de entrada (extracto):**\n```\n"
            + _trunc(participantes, 2000)
            + "\n```\n"
        )

    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    try:
        data = _sec_get_json(url)
    except requests.RequestException as e:
        logger.warning("SEC submissions %s: %s", cik, e)
        return (
            "## Estados Unidos (SEC EDGAR)\n\n"
            f"*Error al descargar submissions para CIK {cik}: {e}*\n"
            f"*Resolución: {note}*"
            + (f", ticker {ticker}" if ticker else "")
            + "\n"
        )

    body = _format_sec_recent_submissions(data, limit=22)
    return (
        "## Estados Unidos (SEC EDGAR) — datos de API\n\n"
        f"*Emisor resuelto: CIK **{cik}** ({note})"
        + (f", ticker **{ticker}**" if ticker else "")
        + ".*\n\n"
        + body
        + "\n"
    )
