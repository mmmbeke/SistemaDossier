"""Orquestación: investigación de persona con Gemini (Google Search) y, opcionalmente, Netrows."""
from __future__ import annotations

import os
from typing import Any

from dossier.schemas.person_research import PersonResearchRequest, PersonResearchSource
from dossier.services.netrows_client import NetrowsApiError, NetrowsClient
from dossier.services.person_gemini_analysis import analyze_person_profile_bundle
from dossier.services.person_gemini_web_research import analyze_person_with_google_search
from dossier.services.person_netrows_lookup import extract_profile_urls, split_person_name


def _s(v: str | None) -> str | None:
    if v is None:
        return None
    t = v.strip()
    return t or None


def _merge_geo(country: str | None, city: str | None) -> str | None:
    c = _s(country)
    ci = _s(city)
    if ci and c:
        return f"{ci}, {c}"
    return c or ci


def _clean_params(raw: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in raw.items():
        if v is None:
            continue
        if isinstance(v, str) and not v.strip():
            continue
        out[k] = v
    return out


def _filters_for_person_gemini(
    req: PersonResearchRequest, organization_context_block: str | None
) -> dict[str, Any]:
    filters: dict[str, Any] = {
        "full_name": req.full_name,
        "job_area": req.job_area,
        "company": req.company,
        "country": req.country,
        "city": req.city,
        "extra_keywords": req.extra_keywords,
    }
    oc = (organization_context_block or "").strip()
    if oc:
        filters["contexto_organizacion_cliente"] = oc
    return filters


def _google_search_disabled() -> bool:
    return (os.getenv("GEMINI_DISABLE_GOOGLE_SEARCH") or "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def _gemini_web_search_for_person_always() -> bool:
    """Por defecto sí: Gemini + Google Search en cada búsqueda (además de Netrows si hay datos)."""
    v = (os.getenv("GEMINI_PERSON_WEB_ALWAYS") or "1").strip().lower()
    return v not in ("0", "false", "no")


def _warnings_for_empty_netrows(attempts: list[dict[str, Any]]) -> list[str]:
    """
    Si no hay URLs de perfil, explicar causas típicas (clave Netrows, cuota, etc.)
    a partir de los intentos guardados en `search_attempts`.
    """
    if not attempts:
        return []

    failed = [a for a in attempts if isinstance(a, dict) and "http_status" in a]
    succeeded = [
        a for a in attempts if isinstance(a, dict) and "response" in a and "http_status" not in a
    ]
    out: list[str] = []

    if len(failed) == len(attempts):
        codes = {int(a["http_status"]) for a in failed if isinstance(a.get("http_status"), int)}
        if codes and codes <= {401, 403}:
            out.append(
                "Netrows respondió 401/403 en todas las búsquedas: suele indicar que NETROWS_API_KEY "
                "es incorrecta, revocada o caducada (no es un tema de «palabras clave»). "
                "Revisa `.env` y el panel de tu cuenta en netrows.com."
            )
        elif 429 in codes:
            out.append(
                "Netrows respondió 429 (demasiadas peticiones o cuota agotada). Espera unos minutos "
                "o revisa tu plan en Netrows."
            )
        elif 402 in codes:
            out.append(
                "Netrows respondió 402 (pago o plan requerido). Comprueba facturación o límites de tu cuenta."
            )
        else:
            snippet = ""
            for a in failed:
                err = a.get("error")
                if isinstance(err, str) and err.strip():
                    snippet = err.strip()[:220]
                    break
            codes_txt = ", ".join(str(c) for c in sorted(codes)) if codes else "?"
            out.append(
                f"Todas las llamadas a Netrows `/people/search` fallaron (HTTP: {codes_txt}). {snippet}"
            )
    elif failed and (401 in {a.get("http_status") for a in failed} or 403 in {a.get("http_status") for a in failed}):
        out.append(
            "Al menos una llamada a Netrows devolvió 401/403: conviene revisar NETROWS_API_KEY "
            "aunque otras peticiones respondieron sin error pero sin perfiles."
        )

    if succeeded and not failed:
        all_marker = True
        for a in succeeded:
            r = a.get("response")
            if not isinstance(r, dict) or not r.get("_netrowsEmptySearch"):
                all_marker = False
                break
        if all_marker:
            out.append(
                "Netrows indicó explícitamente «sin resultados» en las búsquedas. "
                "No suele ser fallo de clave; prueba afinar nombre, ciudad o empresa."
            )

    return out


def _keywords_for_search(
    full_name: str,
    single_kw: str | None,
    extra: str | None,
) -> str | None:
    extra_s = _s(extra)
    if single_kw:
        return " ".join(p for p in (single_kw, extra_s) if p).strip() or single_kw
    if extra_s:
        return " ".join(p for p in (full_name.strip(), extra_s) if p).strip()
    return None


def _search_strategies(req: PersonResearchRequest) -> list[tuple[str, dict[str, Any]]]:
    name = req.full_name.strip()
    first, last, single_kw = split_person_name(name)
    geo = _merge_geo(req.country, req.city)
    job = _s(req.job_area)
    comp = _s(req.company)
    extra = _s(req.extra_keywords)
    kw = _keywords_for_search(name, single_kw, extra)
    start = req.start

    strategies: list[tuple[str, dict[str, Any]]] = []

    def add(label: str, d: dict[str, Any]) -> None:
        p = _clean_params(d)
        if not p:
            return
        strategies.append((label, p))

    add(
        "completo (nombre + filtros + geo)",
        {
            "firstName": first,
            "lastName": last,
            # Incluir siempre nombre (+ extra) en keywords; antes solo se enviaba `extra`
            # y la API recibía p. ej. solo "universidad" sin el nombre.
            "keywords": kw,
            "keywordTitle": job,
            "company": comp,
            "geo": geo,
            "start": start,
        },
    )
    if first and last:
        add(
            "nombre completo en keywords + filtros + geo",
            {
                "keywords": " ".join(x for x in (name, extra) if x).strip(),
                "keywordTitle": job,
                "company": comp,
                "geo": geo,
                "start": 0,
            },
        )
        add(
            "solo nombre + geo",
            {
                "firstName": first,
                "lastName": last,
                "geo": geo,
                "start": start,
            },
        )
    add(
        "keywords + geo (sin empresa/cargo)",
        {
            "keywords": " ".join(x for x in (name, extra) if x).strip(),
            "geo": geo,
            "start": 0,
        },
    )
    if first and last:
        add(
            "solo nombre sin geo",
            {
                "firstName": first,
                "lastName": last,
                "keywordTitle": job,
                "company": comp,
                "start": start,
            },
        )
    add(
        "keywords sin geo",
        {"keywords": " ".join(x for x in (name, extra) if x).strip(), "start": 0},
    )

    seen: set[frozenset[tuple[str, str]]] = set()
    unique: list[tuple[str, dict[str, Any]]] = []
    for label, p in strategies:
        key = frozenset((k, str(v)) for k, v in sorted(p.items()))
        if key in seen:
            continue
        seen.add(key)
        unique.append((label, p))
    return unique


def run_person_research(
    req: PersonResearchRequest,
    *,
    organization_context_block: str | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    gemini_only = req.research_source == PersonResearchSource.gemini_web
    research_mode: str = "gemini_web" if gemini_only else "netrows_plus_gemini"

    client: NetrowsClient | None = None
    attempts: list[dict[str, Any]] = []
    ordered_urls: list[str] = []
    urls: list[str] = []
    profiles: list[dict[str, Any]] = []
    posts_by_url: dict[str, Any] = {}

    if not gemini_only:
        try:
            client = NetrowsClient()
        except ValueError as e:
            warnings.append(
                f"Búsqueda Netrows solicitada pero no está disponible ({e}). "
                "Configura NETROWS_API_KEY en el servidor. Si hay Gemini, se intentará informe por búsqueda web."
            )

        max_collect = max(16, req.max_profiles * 4)
        seen_url: set[str] = set()

        if client is not None:
            for label, params in _search_strategies(req):
                try:
                    data = client.get("/people/search", params)
                except NetrowsApiError as e:
                    attempts.append(
                        {
                            "strategy": label,
                            "params": params,
                            "error": str(e),
                            "http_status": e.status,
                        }
                    )
                    continue
                attempts.append({"strategy": label, "params": params, "response": data})
                for u in extract_profile_urls(data, max_urls=max_collect):
                    if u not in seen_url:
                        seen_url.add(u)
                        ordered_urls.append(u)
                if len(ordered_urls) >= max_collect:
                    break

        urls = ordered_urls[: req.max_profiles]

        if client is not None:
            for url in urls:
                try:
                    prof = client.get("/people/profile", {"url": url})
                    profiles.append({"url": url, "data": prof})
                except NetrowsApiError as e:
                    profiles.append({"url": url, "error": str(e), "http_status": e.status})
                    warnings.append(f"Perfil no disponible para {url}: HTTP {e.status}")

                if req.include_posts:
                    try:
                        posts = client.get("/people/posts", {"url": url, "limit": 15})
                        posts_by_url[url] = posts
                    except NetrowsApiError as e:
                        posts_by_url[url] = {"error": str(e), "http_status": e.status}
                        warnings.append(f"Posts no disponibles para {url}: HTTP {e.status}")

    gemini_md: str | None = None
    gemini_google_search_used = False
    has_gemini_key = any(os.getenv(k) for k in ("GEMINI_API_KEY", "GOOGLE_API_KEY"))
    filters_gem = _filters_for_person_gemini(req, organization_context_block)

    md_web: str | None = None
    run_web = has_gemini_key and not _google_search_disabled() and (
        gemini_only or _gemini_web_search_for_person_always() or not profiles
    )
    if run_web:
        try:
            md_web = analyze_person_with_google_search(filters=filters_gem)
            gemini_google_search_used = True
            if not gemini_only:
                warnings.append(
                    "Se ha añadido un bloque complementario desde fuentes públicas en la web "
                    "(además de los datos de perfiles)."
                )
        except RuntimeError as e:
            warnings.append(str(e))
        except Exception as e:  # noqa: BLE001
            warnings.append(f"Error en búsqueda web complementaria: {e!s}")

    if gemini_only:
        if md_web:
            gemini_md = md_web
        elif not has_gemini_key:
            warnings.append(
                "Sin GEMINI_API_KEY / GOOGLE_API_KEY no se puede ejecutar la búsqueda por IA (Gemini + web)."
            )
        elif _google_search_disabled():
            warnings.append(
                "GEMINI_DISABLE_GOOGLE_SEARCH=1: con «búsqueda por IA» no hay otra fuente; no se generó informe."
            )
    elif profiles and not has_gemini_key:
        warnings.append("GEMINI_API_KEY no configurada: se omitió el análisis con IA sobre datos Netrows.")
    elif profiles:
        try:
            gemini_md = analyze_person_profile_bundle(
                filters=filters_gem,
                profiles=profiles,
                posts_by_url=posts_by_url if req.include_posts else {},
            )
            if md_web:
                gemini_md = (
                    gemini_md
                    + "\n\n---\n\n### Complemento (fuentes públicas en la web)\n\n"
                    + md_web
                )
        except RuntimeError as e:
            warnings.append(str(e))
        except Exception as e:  # noqa: BLE001
            warnings.append(f"Error en análisis sobre perfiles: {e!s}")
        if gemini_md is None and md_web:
            gemini_md = md_web
    elif req.research_source == PersonResearchSource.netrows and not profiles:
        if md_web:
            gemini_md = md_web
        elif not has_gemini_key:
            warnings.append(
                "Sin perfiles de Netrows y sin GEMINI_API_KEY / GOOGLE_API_KEY: no se pudo ejecutar "
                "la búsqueda con Gemini en la web."
            )
        elif _google_search_disabled():
            warnings.append(
                "Sin perfiles de Netrows y GEMINI_DISABLE_GOOGLE_SEARCH=1: no se ejecutó la búsqueda web con Gemini."
            )

    if req.research_source == PersonResearchSource.netrows and not ordered_urls and attempts:
        hints = _warnings_for_empty_netrows(attempts)
        warnings.extend(hints)
        failures = [a for a in attempts if isinstance(a, dict) and "http_status" in a]

        def _http_code(a: dict[str, Any]) -> int | None:
            s = a.get("http_status")
            if isinstance(s, int):
                return s
            if isinstance(s, str) and s.isdigit():
                return int(s)
            return None

        only_402 = (
            failures
            and len(failures) == len(attempts)
            and all(_http_code(a) == 402 for a in failures)
        )
        if only_402:
            warnings.append(
                "No se obtendrán URLs de perfil mientras Netrows devuelva 402: el bloqueo es por "
                "plan o facturación en netrows.com, no por los filtros de búsqueda."
            )
        elif not gemini_google_search_used:
            warnings.append(
                "No se encontraron URLs de perfil en las respuestas de búsqueda. "
                "Prueba a afinar país, ciudad, empresa o palabras clave. "
                "Si acabas de rotar la clave, reinicia el servidor para recargar `.env`."
            )

    return {
        "filters_applied": {
            "full_name": req.full_name,
            "job_area": req.job_area,
            "company": req.company,
            "country": req.country,
            "city": req.city,
            "extra_keywords": req.extra_keywords,
            "contexto_organizacion_cliente": (organization_context_block or "").strip()
            or None,
            "geo_effective": _merge_geo(req.country, req.city),
            "start": req.start,
            "max_profiles": req.max_profiles,
            "include_posts": req.include_posts,
            "research_source": req.research_source.value,
            "research_mode": research_mode,
            "netrows_used": req.research_source == PersonResearchSource.netrows,
        },
        "search_attempts": attempts,
        "profile_urls": urls,
        "profiles": profiles,
        "posts_by_url": posts_by_url if req.include_posts else {},
        "gemini_analysis_markdown": gemini_md,
        "gemini_google_search_used": gemini_google_search_used,
        "warnings": warnings,
    }
