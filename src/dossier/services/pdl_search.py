"""Estrategias de búsqueda PDL (person/enrich + person/search SQL)."""
from __future__ import annotations

from typing import Any

from dossier.schemas.person_research import PersonResearchRequest
from dossier.services.lusha_company import company_search_variants
from dossier.services.person_profile_lookup import split_person_name


def _sql_escape(value: str) -> str:
    return value.replace("'", "''")


def _normalize_linkedin(url: str) -> str:
    u = url.strip()
    if not u:
        return u
    if not u.startswith("http"):
        u = f"https://{u.lstrip('/')}"
    return u


def build_pdl_enrich_strategies(req: PersonResearchRequest) -> list[tuple[str, dict[str, Any]]]:
    """Parámetros para GET /v5/person/enrich (una estrategia por intento)."""
    strategies: list[tuple[str, dict[str, Any]]] = []
    seen: set[frozenset[tuple[str, str]]] = set()

    def add(label: str, params: dict[str, Any]) -> None:
        clean = {k: v for k, v in params.items() if v is not None and str(v).strip()}
        if not clean:
            return
        key = frozenset((k, str(v)) for k, v in sorted(clean.items()))
        if key in seen:
            return
        seen.add(key)
        strategies.append((label, clean))

    em = (req.email or "").strip().lower()
    if em and "@" in em:
        add("email", {"email": em})

    li = _normalize_linkedin(req.linkedin_url or "")
    if li:
        add("profile (LinkedIn)", {"profile": li})

    name = req.full_name.strip()
    first, last, single = split_person_name(name)
    companies = company_search_variants(req.company)
    location = ", ".join(
        p for p in [(req.city or "").strip(), (req.country or "").strip()] if p
    )

    if first and last:
        for comp in companies:
            add(f"nombre + company ({comp[:40]})", {
                "first_name": first,
                "last_name": last,
                "company": comp,
            })
        if location:
            add("nombre + location", {
                "first_name": first,
                "last_name": last,
                "location": location,
            })
        if req.country and not location:
            add("nombre + country", {
                "first_name": first,
                "last_name": last,
                "country": req.country.strip(),
            })
    elif single and companies:
        add("name + company", {"name": single, "company": companies[0]})

    if name and len(name) >= 2 and not (first and last):
        add("name", {"name": name})

    return strategies


def build_pdl_search_sql(req: PersonResearchRequest, *, limit: int = 5) -> str | None:
    """SQL fallback para POST /v5/person/search."""
    name = req.full_name.strip()
    if len(name) < 2:
        return None

    clauses: list[str] = []
    first, last, single = split_person_name(name)
    if first and last:
        clauses.append(
            f"(first_name='{_sql_escape(first)}' AND last_name='{_sql_escape(last)}')"
        )
    elif single:
        clauses.append(f"full_name='{_sql_escape(single)}'")
    else:
        clauses.append(f"full_name='{_sql_escape(name)}'")

    companies = company_search_variants(req.company)
    if companies:
        comp = _sql_escape(companies[0])
        clauses.append(f"job_company_name='{comp}'")

    em = (req.email or "").strip().lower()
    if em and "@" in em:
        domain = em.split("@", 1)[1]
        if domain:
            clauses.append(f"work_email LIKE '%@{_sql_escape(domain)}'")

    if req.country:
        clauses.append(f"location_country='{_sql_escape(req.country.strip())}'")

    where = " AND ".join(clauses)
    lim = min(max(limit, 1), 100)
    return f"SELECT * FROM person WHERE {where} LIMIT {lim}"
