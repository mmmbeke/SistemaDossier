"""Parseo de respuestas Lusha API v3 (search / enrich / search-and-enrich)."""
from __future__ import annotations

from typing import Any

from dossier.services.person_profile_lookup import _contact_id, extract_lusha_contacts


def lusha_result_errors(payload: Any) -> list[dict[str, Any]]:
    """Errores por contacto en ``results[]`` (NOT_FOUND, COMPLIANCE_RESTRICTED, …)."""
    if not isinstance(payload, dict):
        return []
    results = payload.get("results")
    if not isinstance(results, list):
        return []
    out: list[dict[str, Any]] = []
    for item in results:
        if isinstance(item, dict) and isinstance(item.get("error"), dict):
            out.append(item["error"])
    return out


def extract_lusha_search_results(
    payload: Any,
    *,
    max_items: int = 8,
) -> list[dict[str, Any]]:
    """
    Extrae contactos de respuestas v3 con ``results[]``.

    Ignora entradas que solo traen ``error``; acepta preview (search) o perfil enriquecido.
    """
    if payload is None:
        return []

    if isinstance(payload, dict):
        results = payload.get("results")
        if isinstance(results, list):
            out: list[dict[str, Any]] = []
            seen_ids: set[str] = set()
            for item in results:
                if not isinstance(item, dict) or item.get("error"):
                    continue
                contact = item.get("contact") if isinstance(item.get("contact"), dict) else item
                if not isinstance(contact, dict):
                    continue
                cid = _contact_id(contact)
                if cid and cid in seen_ids:
                    continue
                has_signal = cid or contact.get("firstName") or contact.get("fullName")
                if not has_signal:
                    continue
                if cid:
                    seen_ids.add(cid)
                out.append(contact)
                if len(out) >= max_items:
                    break
            if out:
                return out

    return extract_lusha_contacts(payload, max_items=max_items)
