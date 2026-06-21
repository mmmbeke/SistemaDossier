"""Orquestación: investigación de persona con Gemini (Google Search) y, opcionalmente, Lusha."""
from __future__ import annotations

import os
from typing import Any

from dossier.schemas.person_research import PersonResearchRequest, PersonResearchSource
from dossier.services.lusha_client import LushaApiError, LushaClient
from dossier.services.person_gemini_analysis import analyze_person_profile_bundle
from dossier.services.person_gemini_web_research import analyze_person_with_google_search
from dossier.services.person_lusha_lookup import (
    extract_results_from_response,
    is_empty_search_marker,
    result_profile_key,
    split_person_name,
)


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
    """Por defecto sí: Gemini + Google Search en cada búsqueda (además de Lusha si hay datos)."""
    v = (os.getenv("GEMINI_PERSON_WEB_ALWAYS") or "1").strip().lower()
    return v not in ("0", "false", "no")


def _warnings_for_empty_lusha(attempts: list[dict[str, Any]]) -> list[str]:
    """Si no hay perfiles, explicar causas típicas a partir de ``search_attempts``."""
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
                "Lusha respondió 401/403 en todas las búsquedas: suele indicar que LUSHA_API_KEY "
                "es incorrecta, revocada o caducada. Revisa `.env` y el panel de Lusha."
            )
        elif 429 in codes:
            out.append(
                "Lusha respondió 429 (demasiadas peticiones o cuota agotada). "
                "Espera unos minutos o revisa tu plan."
            )
        elif 402 in codes:
            out.append(
                "Lusha respondió 402 (créditos insuficientes o pago requerido). "
                "Comprueba facturación o límites de tu cuenta."
            )
        elif 451 in codes:
            out.append(
                "Lusha respondió 451 (bloqueo por GDPR). El contacto puede no estar disponible "
                "por normativa de privacidad."
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
                f"Todas las llamadas a Lusha `/v3/contacts/search-and-enrich` fallaron (HTTP: {codes_txt}). {snippet}"
            )
    elif failed and (401 in {a.get("http_status") for a in failed} or 403 in {a.get("http_status") for a in failed}):
        out.append(
            "Al menos una llamada a Lusha devolvió 401/403: conviene revisar LUSHA_API_KEY "
            "aunque otras peticiones respondieron sin error pero sin perfiles."
        )

    if succeeded and not failed:
        all_marker = True
        for a in succeeded:
            r = a.get("response")
            if not is_empty_search_marker(r):
                all_marker = False
                break
        if all_marker:
            out.append(
                "Lusha no devolvió contactos en las búsquedas. "
                "Prueba afinar nombre o empresa (firstName + lastName + companyName)."
            )

    return out


def _lusha_search_strategies(req: PersonResearchRequest) -> list[tuple[str, dict[str, Any]]]:
    """Estrategias de identificadores aceptados por ``POST /v3/contacts/search-and-enrich``."""
    name = req.full_name.strip()
    first, last, single = split_person_name(name)
    comp = _s(req.company)

    strategies: list[tuple[str, dict[str, Any]]] = []

    def add(label: str, contact: dict[str, Any]) -> None:
        clean = {k: v for k, v in contact.items() if v is not None and str(v).strip()}
        if clean:
            strategies.append((label, clean))

    if first and last:
        if comp:
            add(
                "nombre + empresa",
                {"firstName": first, "lastName": last, "companyName": comp},
            )
        add("solo nombre", {"firstName": first, "lastName": last})
    elif single:
        add("nombre único", {"firstName": single})

    seen: set[frozenset[tuple[str, str]]] = set()
    unique: list[tuple[str, dict[str, Any]]] = []
    for label, contact in strategies:
        key = frozenset((k, str(v)) for k, v in sorted(contact.items()))
        if key in seen:
            continue
        seen.add(key)
        unique.append((label, contact))
    return unique


def run_person_research(
    req: PersonResearchRequest,
    *,
    organization_context_block: str | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    gemini_only = req.research_source == PersonResearchSource.gemini_web
    research_mode: str = "gemini_web" if gemini_only else "lusha_plus_gemini"

    client: LushaClient | None = None
    attempts: list[dict[str, Any]] = []
    ordered_keys: list[str] = []
    urls: list[str] = []
    profiles: list[dict[str, Any]] = []

    if not gemini_only:
        try:
            client = LushaClient()
        except ValueError as e:
            warnings.append(
                f"Búsqueda Lusha solicitada pero no está disponible ({e}). "
                "Configura LUSHA_API_KEY en el servidor. Si hay Gemini, se intentará informe por búsqueda web."
            )

        reveal = ["emails", "phones"] if req.reveal_contact_details else None
        seen_key: set[str] = set()
        max_collect = max(req.max_profiles, req.max_profiles * 2)

        if client is not None:
            for label, contact in _lusha_search_strategies(req):
                try:
                    data = client.search_and_enrich_contacts([contact], reveal=reveal)
                except LushaApiError as e:
                    attempts.append(
                        {
                            "strategy": label,
                            "contact": contact,
                            "error": str(e),
                            "http_status": e.status,
                        }
                    )
                    continue
                attempts.append({"strategy": label, "contact": contact, "response": data})
                for row in extract_results_from_response(data):
                    key = result_profile_key(row)
                    if not key or key in seen_key:
                        continue
                    seen_key.add(key)
                    ordered_keys.append(key)
                    profiles.append({"url": key, "data": row})
                if len(profiles) >= max_collect:
                    break

        profiles = profiles[: req.max_profiles]
        urls = [p["url"] for p in profiles]

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
        warnings.append("GEMINI_API_KEY no configurada: se omitió el análisis con IA sobre datos Lusha.")
    elif profiles:
        try:
            gemini_md = analyze_person_profile_bundle(
                filters=filters_gem,
                profiles=profiles,
                posts_by_url={},
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
    elif req.research_source == PersonResearchSource.lusha and not profiles:
        if md_web:
            gemini_md = md_web
        elif not has_gemini_key:
            warnings.append(
                "Sin perfiles de Lusha y sin GEMINI_API_KEY / GOOGLE_API_KEY: no se pudo ejecutar "
                "la búsqueda con Gemini en la web."
            )
        elif _google_search_disabled():
            warnings.append(
                "Sin perfiles de Lusha y GEMINI_DISABLE_GOOGLE_SEARCH=1: no se ejecutó la búsqueda web con Gemini."
            )

    if req.research_source == PersonResearchSource.lusha and not ordered_keys and attempts:
        hints = _warnings_for_empty_lusha(attempts)
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
                "No se obtendrán perfiles mientras Lusha devuelva 402: el bloqueo es por "
                "créditos o facturación, no por los filtros de búsqueda."
            )
        elif not gemini_google_search_used:
            warnings.append(
                "No se encontraron contactos en las respuestas de Lusha. "
                "Prueba a afinar nombre y empresa. "
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
            "reveal_contact_details": req.reveal_contact_details,
            "research_source": req.research_source.value,
            "research_mode": research_mode,
            "lusha_used": req.research_source == PersonResearchSource.lusha,
        },
        "search_attempts": attempts,
        "profile_urls": urls,
        "profiles": profiles,
        "posts_by_url": {},
        "gemini_analysis_markdown": gemini_md,
        "gemini_google_search_used": gemini_google_search_used,
        "warnings": warnings,
    }
