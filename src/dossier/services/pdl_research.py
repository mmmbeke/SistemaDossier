"""Búsqueda de perfiles de persona vía People Data Labs."""
from __future__ import annotations

from typing import Any

from dossier.schemas.person_research import PersonResearchRequest
from dossier.services.pdl_client import PdlApiError, PdlClient, pdl_error_message
from dossier.services.pdl_contact_parse import pdl_person_from_enrich, pdl_people_from_search
from dossier.services.pdl_search import build_pdl_enrich_strategies, build_pdl_search_sql
from dossier.services.person_profile_lookup import extract_profile_urls


def _person_to_profile(person: dict[str, Any]) -> dict[str, Any]:
    pid = str(person.get("id") or "").strip() or None
    urls = extract_profile_urls(person, max_urls=3)
    li = person.get("linkedin_url")
    if isinstance(li, str) and li.strip() and li.strip() not in urls:
        urls = [li.strip(), *urls]
    return {
        "provider": "pdl",
        "provider_id": pid,
        "pdl_id": pid,
        "linkedin_urls": urls,
        "data": person,
    }


def _contact_key(profile: dict[str, Any]) -> str:
    pid = profile.get("provider_id") or profile.get("pdl_id")
    if pid:
        return f"pdl:{pid}"
    urls = profile.get("linkedin_urls") or []
    if urls:
        return f"url:{urls[0]}"
    data = profile.get("data") or {}
    name = str(data.get("full_name") or "").strip()
    comp = str(data.get("job_company_name") or "").strip()
    return f"name:{name}|{comp}"


def fetch_pdl_profiles(
    req: PersonResearchRequest,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    """
    Devuelve (profiles, search_attempts, warnings).

    Flujo: person/enrich por estrategia → fallback person/search (SQL).
    """
    warnings: list[str] = []
    attempts: list[dict[str, Any]] = []
    profiles: list[dict[str, Any]] = []
    seen: set[str] = set()

    try:
        client = PdlClient()
    except ValueError as e:
        warnings.append(str(e))
        return profiles, attempts, warnings

    max_collect = max(8, req.max_profiles * 3)

    for label, params in build_pdl_enrich_strategies(req):
        try:
            data = client.person_enrich(params)
        except PdlApiError as e:
            attempts.append({
                "strategy": label,
                "params": params,
                "error": str(e),
                "http_status": e.status,
                "provider": "pdl",
            })
            if e.status in (401, 402):
                warnings.append(pdl_error_message(e))
                return profiles, attempts, warnings
            continue

        person = pdl_person_from_enrich(data) if data else None
        if person:
            profile = _person_to_profile(person)
            key = _contact_key(profile)
            if key not in seen:
                seen.add(key)
                profiles.append(profile)
            likelihood = data.get("likelihood") if isinstance(data, dict) else None
            attempts.append({
                "strategy": label,
                "params": params,
                "response": {
                    "matched": True,
                    "pdl_id": profile.get("provider_id"),
                    "likelihood": likelihood,
                },
                "provider": "pdl",
            })
        else:
            attempts.append({
                "strategy": label,
                "params": params,
                "response": {"_pdlEmptyMatch": True},
                "provider": "pdl",
            })

        if len(profiles) >= max_collect:
            break

    if len(profiles) < req.max_profiles:
        sql = build_pdl_search_sql(req, limit=max_collect)
        if sql:
            try:
                search_data = client.person_search(sql=sql, size=max_collect)
                found = pdl_people_from_search(search_data, max_items=max_collect)
                attempts.append({
                    "strategy": "person/search (SQL)",
                    "params": {"sql": sql},
                    "response": {"count": len(found), "total": search_data.get("total")},
                    "provider": "pdl",
                })
                for person in found:
                    profile = _person_to_profile(person)
                    key = _contact_key(profile)
                    if key in seen:
                        continue
                    seen.add(key)
                    profiles.append(profile)
                    if len(profiles) >= max_collect:
                        break
            except PdlApiError as e:
                attempts.append({
                    "strategy": "person/search (SQL)",
                    "params": {"sql": sql},
                    "error": str(e),
                    "http_status": e.status,
                    "provider": "pdl",
                })
                if e.status in (401, 402):
                    warnings.append(pdl_error_message(e))

    profiles = profiles[: req.max_profiles]

    if profiles:
        li = (profiles[0].get("linkedin_urls") or [None])[0]
        if li:
            warnings.append(f"PDL encontró perfil (LinkedIn: {li}).")
        else:
            warnings.append("PDL encontró perfil (sin LinkedIn en respuesta).")
    elif attempts:
        failed = [a for a in attempts if "http_status" in a]
        if failed and all(a.get("http_status") in (401, 402) for a in failed):
            warnings.append(pdl_error_message(PdlApiError(int(failed[0]["http_status"]), str(failed[0].get("error") or ""))))
        elif failed and any(a.get("http_status") == 429 for a in failed):
            warnings.append("PDL respondió 429 (límite de tasa). Espera y reintenta.")
        else:
            warnings.append(
                "PDL no devolvió perfiles. Prueba email corporativo, LinkedIn o acrónimo de empresa."
            )

    if req.reveal_contact_details:
        warnings.append(
            "PDL incluye email/teléfono en el match cuando existen; no hay paso «reveal» aparte."
        )

    return profiles, attempts, warnings
