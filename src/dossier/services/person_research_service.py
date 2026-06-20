"""Orquestación: investigación de persona con Gemini (Google Search) y, opcionalmente, Lusha."""
from __future__ import annotations

import os
from typing import Any

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
    """Por defecto sí: Gemini + Google Search en cada búsqueda (además de Lusha si hay datos)."""
    v = (os.getenv("GEMINI_PERSON_WEB_ALWAYS") or "1").strip().lower()
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
                "No se pudo acceder al servicio de registros profesionales (credenciales inválidas o expiradas). "
                "Contacta al administrador del sistema."
            )
        elif 429 in codes:
            out.append(
                "Demasiadas consultas al servicio de registros profesionales. Espera unos minutos e inténtalo de nuevo."
            )
        elif 402 in codes:
            out.append(
                "El servicio de registros profesionales no tiene créditos o plan activo. Comprueba la suscripción."
            )
        elif 451 in codes:
            out.append(
                "Restricción legal o de privacidad para esta consulta. Prueba con otros filtros o contacto."
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
                f"El servicio de registros profesionales no respondió correctamente (HTTP: {codes_txt}). {snippet}"
            )
    elif failed and (
        401 in {a.get("http_status") for a in failed} or 403 in {a.get("http_status") for a in failed}
    ):
        out.append(
            "Hubo un problema de acceso al servicio de registros profesionales; "
            "revisa la configuración del servidor aunque otras peticiones no hayan devuelto perfiles."
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
                "No se encontraron perfiles en los registros profesionales. "
                "Prueba afinar nombre, empresa, país o ciudad."
            )

    return out


def _lusha_search_strategies(req: PersonResearchRequest) -> list[tuple[str, dict[str, Any]]]:
    name = req.full_name.strip()
    first, last, _single = split_person_name(name)
    comp = _s(req.company)
    geo = _merge_geo(req.country, req.city)

    strategies: list[tuple[str, dict[str, Any]]] = []

    def add(label: str, d: dict[str, Any]) -> None:
        p = _clean_params(d)
        if not p:
            return
        strategies.append((label, p))

    if first and last:
        add(
            "nombre + empresa",
            {"firstName": first, "lastName": last, "companyName": comp},
        )
        add(
            "nombre + empresa + país (texto)",
            {"firstName": first, "lastName": last, "companyName": comp, "country": geo},
        )
        add(
            "solo nombre",
            {"firstName": first, "lastName": last},
        )
    elif name:
        add("nombre en una palabra", {"fullName": name, "companyName": comp})

    if comp and first and last:
        add(
            "nombre + dominio inferido (si aplica)",
            {
                "firstName": first,
                "lastName": last,
                "companyName": comp,
            },
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
                "El servicio de registros profesionales no está disponible en el servidor. "
                "Se intentará informe por búsqueda web si está configurada."
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
        if client is not None and enrich_ids:
            try:
                enrich_resp = client.enrich_contacts(enrich_ids, reveal=[])
                for ec in extract_lusha_contacts(enrich_resp, max_items=len(enrich_ids) + 4):
                    eid = None
                    for key in ("id", "contactId", "personId"):
                        if ec.get(key):
                            eid = str(ec[key]).strip()
                            break
                    if eid:
                        enriched_by_id[eid] = ec
            except LushaApiError as e:
                warnings.append("No se pudo enriquecer el perfil con datos adicionales.")

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
                "La opción «incluir posts» no está disponible con registros profesionales; se ignoró."
            )

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
                "No está configurado el servicio de análisis; no se puede ejecutar la búsqueda en web pública."
            )
        elif _google_search_disabled():
            warnings.append(
                "La búsqueda en web pública está desactivada; no se generó informe."
            )
    elif profiles and not has_gemini_key:
        warnings.append("Servicio de análisis no configurado: se omitió la síntesis sobre los perfiles.")
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
                "No se encontraron perfiles y la búsqueda en web pública no está disponible."
            )
        elif _google_search_disabled():
            warnings.append(
                "No se encontraron perfiles y la búsqueda en web pública está desactivada."
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
                "No se obtendrán perfiles hasta activar o renovar el plan del servicio de registros profesionales."
            )
        elif not gemini_google_search_used:
            warnings.append(
                "No se encontraron contactos en los registros profesionales. "
                "Prueba afinar país, ciudad, empresa o palabras clave."
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
