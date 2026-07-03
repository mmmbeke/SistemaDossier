"""Estrategias de búsqueda PDL (person/enrich + person/search SQL)."""
from __future__ import annotations

import re
from typing import Any

from dossier.schemas.person_research import PersonResearchRequest
from dossier.services.lusha_company import company_search_variants
from dossier.services.person_profile_lookup import split_person_name

# Literales permitidos en el dialecto SQL de People Data Labs (API externa, no PostgreSQL).
_PDL_SAFE_LITERAL = re.compile(r"^[\w\s\-'.@áéíóúÁÉÍÓÚñÑüÜ&,]+$")
_PDL_ALLOWED_FIELDS = frozenset({
    "first_name",
    "last_name",
    "full_name",
    "job_company_name",
    "location_country",
})


def _pdl_query_literal(value: str, *, max_len: int = 255) -> str:
    """Escapa y valida un literal para consultas PDL."""
    v = " ".join(value.strip().split())[:max_len]
    if not v:
        raise ValueError("valor vacío para consulta PDL")
    if not _PDL_SAFE_LITERAL.match(v):
        raise ValueError("caracteres no permitidos en consulta PDL")
    return v.replace("'", "''")


def _equals_clause(field: str, value: str) -> str:
    if field not in _PDL_ALLOWED_FIELDS:
        raise ValueError(f"campo PDL no permitido: {field}")
    return f"{field}='{_pdl_query_literal(value)}'"


def _email_domain_clause(domain: str) -> str:
    dom = _pdl_query_literal(domain, max_len=120)
    if "@" in dom or " " in dom:
        raise ValueError("dominio de email inválido para consulta PDL")
    return f"work_email LIKE '%@{dom}'"


def _normalize_linkedin(url: str) -> str:
    u = url.strip()
    if not u:
        return u
    if not u.startswith("http"):
        u = f"https://{u.lstrip('/')}"
    return u


def _last_name_spelling_variants(last: str) -> list[str]:
    """Variantes ortográficas frecuentes (p. ej. Jeria / Jerias)."""
    l = last.strip()
    if len(l) < 3:
        return [l] if l else []
    variants = [l]
    if l.endswith("s") and len(l) > 4:
        variants.append(l[:-1])
    elif not l.endswith("s"):
        variants.append(f"{l}s")
    out: list[str] = []
    seen: set[str] = set()
    for v in variants:
        key = v.lower()
        if key not in seen:
            seen.add(key)
            out.append(v)
    return out


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
        last_variants = _last_name_spelling_variants(last)
        for last_v in last_variants:
            for comp in companies:
                suffix = f" ({last_v})" if last_v != last else ""
                add(f"nombre + company ({comp[:40]}){suffix}", {
                    "first_name": first,
                    "last_name": last_v,
                    "company": comp,
                })
            if location:
                add(f"nombre + location{suffix if last_v != last else ''}", {
                    "first_name": first,
                    "last_name": last_v,
                    "location": location,
                })
            if req.country and not location:
                add(f"nombre + country{suffix if last_v != last else ''}", {
                    "first_name": first,
                    "last_name": last_v,
                    "country": req.country.strip(),
                })
        parts = name.split()
        if len(parts) >= 3:
            add("nombre compuesto + company", {
                "first_name": parts[0],
                "last_name": " ".join(parts[1:]),
                "company": companies[0],
            } if companies else {
                "first_name": parts[0],
                "last_name": " ".join(parts[1:]),
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
            "("
            + _equals_clause("first_name", first)
            + " AND "
            + _equals_clause("last_name", last)
            + ")"
        )
    elif single:
        clauses.append(_equals_clause("full_name", single))
    else:
        clauses.append(_equals_clause("full_name", name))

    companies = company_search_variants(req.company)
    if companies:
        clauses.append(_equals_clause("job_company_name", companies[0]))

    em = (req.email or "").strip().lower()
    if em and "@" in em:
        domain = em.split("@", 1)[1]
        if domain:
            clauses.append(_email_domain_clause(domain))

    if req.country:
        clauses.append(_equals_clause("location_country", req.country.strip()))

    where = " AND ".join(clauses)
    # PDL no admite LIMIT en el SQL; el tope va en el parámetro ``size`` de person/search.
    return "SELECT * FROM person WHERE " + where  # nosec B608
