"""Heurísticas de nombre y extracción de perfiles desde JSON de proveedores (Lusha, etc.)."""
from __future__ import annotations

import re
from typing import Any

_PROFILE_HINT = re.compile(
    r"https?://[^\s\"'<>]+(?:linkedin\.com/in/|linkedin\.com/pub/)[^\s\"'<>]*",
    re.IGNORECASE,
)


def split_person_name(full_name: str) -> tuple[str | None, str | None, str | None]:
    parts = full_name.strip().split()
    if not parts:
        return None, None, None
    if len(parts) == 1:
        return None, None, parts[0]
    last = parts[-1]
    first = " ".join(parts[:-1])
    return first, last, None


def extract_profile_urls(payload: Any, *, max_urls: int = 8) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    def maybe_add(u: str) -> None:
        u = u.strip()
        if not u or u in seen:
            return
        if not u.startswith("http"):
            return
        low = u.lower()
        if "linkedin.com" in low and ("/in/" in low or "/pub/" in low):
            seen.add(u)
            found.append(u)
        elif "linkedin.com" in low:
            seen.add(u)
            found.append(u)

    def walk(obj: Any) -> None:
        if len(found) >= max_urls:
            return
        if isinstance(obj, str):
            for m in _PROFILE_HINT.finditer(obj):
                maybe_add(m.group(0))
            return
        if isinstance(obj, dict):
            for key, val in obj.items():
                lk = str(key).lower()
                if lk in (
                    "url",
                    "profileurl",
                    "profile_url",
                    "publicprofileurl",
                    "link",
                    "linkedinurl",
                    "linkedin_url",
                    "linkedin",
                ) and isinstance(val, str):
                    maybe_add(val)
                walk(val)
        elif isinstance(obj, list):
            for item in obj:
                walk(item)

    walk(payload)
    return found[:max_urls]


def _contact_id(contact: dict[str, Any]) -> str | None:
    for key in ("id", "contactId", "personId"):
        val = contact.get(key)
        if val is not None and str(val).strip():
            return str(val).strip()
    return None


def extract_lusha_contacts(payload: Any, *, max_items: int = 8) -> list[dict[str, Any]]:
    """
    Normaliza respuestas de /v3/contacts/search o /v3/contacts/enrich a lista de contactos.
    Tolera variaciones de forma del JSON de Lusha v3.
    """
    if payload is None:
        return []

    out: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    def add_contact(obj: Any) -> None:
        if len(out) >= max_items:
            return
        if not isinstance(obj, dict):
            return
        cid = _contact_id(obj)
        if cid and cid in seen_ids:
            return
        has_name = any(obj.get(k) for k in ("firstName", "lastName", "fullName", "name"))
        has_company = any(obj.get(k) for k in ("companyName", "company", "currentCompanyName"))
        has_title = any(obj.get(k) for k in ("jobTitle", "title", "currentTitle"))
        has_linkedin = bool(extract_profile_urls(obj, max_urls=1))
        if not (has_name or has_company or has_title or has_linkedin or cid):
            return
        if cid:
            seen_ids.add(cid)
        out.append(obj)

    def walk(obj: Any) -> None:
        if len(out) >= max_items:
            return
        if isinstance(obj, dict):
            if _contact_id(obj) or obj.get("firstName") or obj.get("fullName"):
                add_contact(obj)
            for val in obj.values():
                walk(val)
        elif isinstance(obj, list):
            for item in obj:
                walk(item)

    walk(payload)
    return out[:max_items]
