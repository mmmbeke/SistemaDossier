"""Orquestación: investigación de persona con Gemini (Google Search) y, opcionalmente, Lusha."""
from __future__ import annotations

import os
from typing import Any

from dossier.llm.common import normalize_person_report_text
from dossier.llm.client import deepseek_api_key
from dossier.schemas.person_research import PersonResearchRequest, PersonResearchSource
from dossier.services.lusha_client import LushaApiError, LushaClient
from dossier.services.person_gemini_analysis import analyze_person_profile_bundle
from dossier.services.person_gemini_web_research import analyze_person_with_google_search
from dossier.services.person_profile_lookup import (
    extract_lusha_contacts,
    extract_profile_urls,
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


def _person_web_disabled() -> bool:
    return (os.getenv("DEEPSEEK_DISABLE_PERSON_WEB") or os.getenv("GEMINI_DISABLE_GOOGLE_SEARCH") or "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def _person_web_always() -> bool:
    """Por defecto sí: DeepSeek en cada búsqueda de persona (además de Lusha si hay datos)."""
    v = (os.getenv("DEEPSEEK_PERSON_WEB_ALWAYS") or os.getenv("GEMINI_PERSON_WEB_ALWAYS") or "1").strip().lower()
    return v not in ("0", "false", "no")


def _warnings_for_empty_lusha(attempts: list[dict[str, Any]]) -> list[str]:
    """Explicar causas típicas si Lusha no devolvió contactos."""
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
                "Lusha respondió 401/403: revisa LUSHA_API_KEY en `.env` y el panel de Lusha."
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
                "Lusha respondió 451 (bloqueo por GDPR). El contacto puede no estar disponible."
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
                f"Todas las llamadas a Lusha fallaron (HTTP: {codes_txt}). {snippet}"
            )
    elif failed and (
        401 in {a.get("http_status") for a in failed} or 403 in {a.get("http_status") for a in failed}
    ):
        out.append(
            "Al menos una llamada a Lusha devolvió 401/403: conviene revisar LUSHA_API_KEY."
        )

    if succeeded and not failed:
        all_empty = True
        for a in succeeded:
            r = a.get("response")
            if not isinstance(r, dict) or not r.get("_lushaEmptySearch"):
                all_empty = False
                break
        if all_empty:
            out.append(
                "Lusha no devolvió contactos. Prueba afinar nombre, empresa, país o ciudad."
            )

    return out


def _lusha_search_strategies(req: PersonResearchRequest) -> list[tuple[str, dict[str, Any]]]:
    name = req.full_name.strip()
    first, last, single = split_person_name(name)
    comp = _s(req.company)
    geo = _merge_geo(req.country, req.city)

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
            if geo:
                add(
                    "nombre + empresa + geo",
                    {"firstName": first, "lastName": last, "companyName": comp, "country": geo},
                )
        add("solo nombre", {"firstName": first, "lastName": last})
    elif single:
        add("nombre único", {"firstName": single})
    elif name:
        add("nombre en una palabra", {"fullName": name, "companyName": comp})

    seen: set[frozenset[tuple[str, str]]] = set()
    unique: list[tuple[str, dict[str, Any]]] = []
    for label, contact in strategies:
        key = frozenset((k, str(v)) for k, v in sorted(contact.items()))
        if key in seen:
            continue
        seen.add(key)
        unique.append((label, contact))
    return unique


def _lusha_contact_key(contact: dict[str, Any]) -> str:
    for key in ("id", "contactId", "personId"):
        val = contact.get(key)
        if val is not None and str(val).strip():
            return f"id:{val}"
    urls = extract_profile_urls(contact, max_urls=1)
    if urls:
        return f"url:{urls[0]}"
    name = " ".join(
        str(contact.get(k) or "").strip()
        for k in ("firstName", "lastName", "fullName", "name")
        if contact.get(k)
    ).strip()
    comp = str(contact.get("companyName") or contact.get("company") or "").strip()
    return f"name:{name}|{comp}"


def run_person_research(
    req: PersonResearchRequest,
    *,
    organization_context_block: str | None = None,
    meeting_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    gemini_only = req.research_source == PersonResearchSource.gemini_web
    research_mode: str = "gemini_web" if gemini_only else "lusha_plus_gemini"

    client: LushaClient | None = None
    attempts: list[dict[str, Any]] = []
    ordered_contacts: list[dict[str, Any]] = []
    profiles: list[dict[str, Any]] = []
    profile_urls: list[str] = []

    if not gemini_only:
        try:
            client = LushaClient()
        except ValueError as e:
            warnings.append(
                f"Búsqueda Lusha solicitada pero no está disponible ({e}). "
                "Configura LUSHA_API_KEY en el servidor. Si hay Gemini, se intentará informe por búsqueda web."
            )

        max_collect = max(16, req.max_profiles * 4)
        seen_key: set[str] = set()

        if client is not None:
            for label, params in _lusha_search_strategies(req):
                try:
                    data = client.search_contacts([params])
                except LushaApiError as e:
                    attempts.append(
                        {
                            "strategy": label,
                            "params": params,
                            "error": str(e),
                            "http_status": e.status,
                        }
                    )
                    continue

                contacts = extract_lusha_contacts(data, max_items=max_collect)
                if not contacts:
                    attempts.append(
                        {
                            "strategy": label,
                            "params": params,
                            "response": {"_lushaEmptySearch": True, "raw": data},
                        }
                    )
                else:
                    attempts.append({"strategy": label, "params": params, "response": data})
                    for c in contacts:
                        key = _lusha_contact_key(c)
                        if key in seen_key:
                            continue
                        seen_key.add(key)
                        ordered_contacts.append(c)
                if len(ordered_contacts) >= max_collect:
                    break

        selected = ordered_contacts[: req.max_profiles]

        enrich_ids: list[str] = []
        for c in selected:
            for key in ("id", "contactId", "personId"):
                val = c.get(key)
                if val is not None and str(val).strip():
                    enrich_ids.append(str(val).strip())
                    break

        enriched_by_id: dict[str, dict[str, Any]] = {}
        reveal = ["emails", "phones"] if req.reveal_contact_details else []
        if client is not None and enrich_ids:
            try:
                enrich_resp = client.enrich_contacts(enrich_ids, reveal=reveal)
                for ec in extract_lusha_contacts(enrich_resp, max_items=len(enrich_ids) + 4):
                    eid = None
                    for key in ("id", "contactId", "personId"):
                        if ec.get(key):
                            eid = str(ec[key]).strip()
                            break
                    if eid:
                        enriched_by_id[eid] = ec
            except LushaApiError:
                warnings.append("No se pudo enriquecer el perfil con datos adicionales de Lusha.")

        for c in selected:
            cid = None
            for key in ("id", "contactId", "personId"):
                if c.get(key):
                    cid = str(c[key]).strip()
                    break
            data = enriched_by_id.get(cid, c) if cid else c
            urls = extract_profile_urls(data, max_urls=3)
            if urls:
                profile_urls.extend(u for u in urls if u not in profile_urls)
            profiles.append(
                {
                    "lusha_id": cid,
                    "linkedin_urls": urls,
                    "data": data,
                }
            )

        if req.include_posts:
            warnings.append(
                "La opción «incluir posts» no está disponible con Lusha; se ignoró."
            )

    gemini_md: str | None = None
    gemini_google_search_used = False
    has_llm_key = bool(deepseek_api_key())
    filters_gem = _filters_for_person_gemini(req, organization_context_block)

    md_web: str | None = None
    run_web = has_llm_key and not _person_web_disabled() and (
        gemini_only or _person_web_always() or not profiles
    )
    if run_web:
        try:
            md_web = analyze_person_with_google_search(
                filters=filters_gem,
                meeting_context=meeting_context,
            )
            gemini_google_search_used = True
            if not gemini_only and not profiles:
                warnings.append(
                    "Informe generado con DeepSeek a partir del encargo (sin datos Lusha)."
                )
        except RuntimeError as e:
            warnings.append(str(e))
        except Exception as e:  # noqa: BLE001
            warnings.append(f"Error en análisis complementario con DeepSeek: {e!s}")

    if gemini_only:
        if md_web:
            gemini_md = md_web
        elif not has_llm_key:
            warnings.append(
                "Sin DEEPSEEK_API_KEY no se puede ejecutar la búsqueda por IA."
            )
        elif _person_web_disabled():
            warnings.append(
                "DEEPSEEK_DISABLE_PERSON_WEB=1: con «búsqueda por IA» no hay otra fuente; no se generó informe."
            )
    elif profiles and not has_llm_key:
        warnings.append("DEEPSEEK_API_KEY no configurada: se omitió el análisis con IA sobre datos Lusha.")
    elif profiles:
        try:
            gemini_md = analyze_person_profile_bundle(
                filters=filters_gem,
                profiles=profiles,
                posts_by_url={},
                meeting_context=meeting_context,
            )
            if md_web and not gemini_md:
                gemini_md = md_web
            elif md_web and gemini_md:
                warnings.append(
                    "Búsqueda web complementaria omitida en el informe: el análisis Lusha "
                    "ya incluye la estructura completa."
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
        elif not has_llm_key:
            warnings.append(
                "Sin perfiles de Lusha y sin DEEPSEEK_API_KEY: no se pudo ejecutar el análisis con IA."
            )
        elif _person_web_disabled():
            warnings.append(
                "Sin perfiles de Lusha y DEEPSEEK_DISABLE_PERSON_WEB=1: no se ejecutó el análisis con IA."
            )

    if req.research_source == PersonResearchSource.lusha and not ordered_contacts and attempts:
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
                "No se encontraron contactos en Lusha. Prueba afinar nombre, empresa, país o ciudad."
            )

    gemini_md = normalize_person_report_text(gemini_md)

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
            "include_posts": req.include_posts,
            "research_source": req.research_source.value,
            "research_mode": research_mode,
            "lusha_used": req.research_source == PersonResearchSource.lusha,
        },
        "search_attempts": attempts,
        "profile_urls": profile_urls[: req.max_profiles],
        "profiles": profiles,
        "posts_by_url": {},
        "gemini_analysis_markdown": gemini_md,
        "gemini_google_search_used": gemini_google_search_used,
        "warnings": warnings,
    }
