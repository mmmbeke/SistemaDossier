"""Orquestación: Netrows (búsqueda + perfiles) y contexto para análisis Gemini."""
from __future__ import annotations

import os
from typing import Any

from dossier.schemas.person_research import PersonResearchRequest
from dossier.services.netrows_client import NetrowsApiError, NetrowsClient
from dossier.services.person_gemini_analysis import analyze_person_profile_bundle
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
            "keywords": (extra or None) if (first and last) else kw,
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
    try:
        client = NetrowsClient()
    except ValueError as e:
        raise ValueError(str(e)) from e

    max_collect = max(16, req.max_profiles * 4)
    attempts: list[dict[str, Any]] = []
    ordered_urls: list[str] = []
    seen_url: set[str] = set()

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
    profiles: list[dict[str, Any]] = []
    posts_by_url: dict[str, Any] = {}

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
    if profiles and not any(os.getenv(k) for k in ("GEMINI_API_KEY", "GOOGLE_API_KEY")):
        warnings.append("GEMINI_API_KEY no configurada: se omitió el análisis con IA.")
    elif profiles:
        try:
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
            gemini_md = analyze_person_profile_bundle(
                filters=filters,
                profiles=profiles,
                posts_by_url=posts_by_url if req.include_posts else {},
            )
        except RuntimeError as e:
            warnings.append(str(e))
        except Exception as e:  # noqa: BLE001 — devolver aviso sin tumbar la API
            warnings.append(f"Error en análisis Gemini: {e!s}")

    if not ordered_urls:
        warnings.append(
            "No se encontraron URLs de perfil en las respuestas de búsqueda. "
            "Prueba a afinar país, ciudad, empresa o palabras clave."
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
        },
        "search_attempts": attempts,
        "profile_urls": urls,
        "profiles": profiles,
        "posts_by_url": posts_by_url if req.include_posts else {},
        "gemini_analysis_markdown": gemini_md,
        "warnings": warnings,
    }
