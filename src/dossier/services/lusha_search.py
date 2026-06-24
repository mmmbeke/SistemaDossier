"""Estrategias de búsqueda Lusha v3 (OpenAPI V3ContactSearchItem)."""
from __future__ import annotations

from typing import Any

from dossier.services.lusha_company import company_search_variants, email_to_company_domain
from dossier.services.person_profile_lookup import extract_profile_urls, split_person_name


def build_lusha_search_strategies(
    *,
    full_name: str,
    company: str | None = None,
    email: str | None = None,
    linkedin_url: str | None = None,
) -> list[tuple[str, dict[str, Any]]]:
    """
    Identificadores válidos Lusha v3:

    - ``id``, ``linkedinUrl``, ``email``
    - ``firstName`` + ``lastName`` + (``companyName`` | ``companyDomain``)
    """
    strategies: list[tuple[str, dict[str, Any]]] = []
    seen: set[frozenset[tuple[str, str]]] = set()

    def add(label: str, contact: dict[str, Any]) -> None:
        clean = {k: v for k, v in contact.items() if v is not None and str(v).strip()}
        if not clean:
            return
        key = frozenset((k, str(v)) for k, v in sorted(clean.items()))
        if key in seen:
            return
        seen.add(key)
        strategies.append((label, clean))

    em = (email or "").strip().lower()
    if em and "@" in em:
        add("email", {"email": em})
        domain = email_to_company_domain(em)
        if domain:
            add("companyDomain (desde email)", {"companyDomain": domain})

    li = (linkedin_url or "").strip()
    if li:
        add("linkedinUrl", {"linkedinUrl": li})

    name = full_name.strip()
    first, last, single = split_person_name(name)
    companies = company_search_variants(company)

    if first and last:
        # companyDomain suele ser más preciso que nombre largo de universidad
        domain = email_to_company_domain(em) if em else None
        if domain:
            add("nombre + companyDomain", {
                "firstName": first,
                "lastName": last,
                "companyDomain": domain,
            })
        for comp in companies:
            add(f"nombre + empresa ({comp[:40]})", {
                "firstName": first,
                "lastName": last,
                "companyName": comp,
            })
    elif single and companies:
        add("nombre único + empresa", {
            "firstName": single,
            "companyName": companies[0],
        })

    return strategies
