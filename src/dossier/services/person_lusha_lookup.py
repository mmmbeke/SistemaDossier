"""Heurísticas de nombre y extracción de perfiles desde respuestas Lusha V3."""
from __future__ import annotations

from typing import Any


def split_person_name(full_name: str) -> tuple[str | None, str | None, str | None]:
    parts = full_name.strip().split()
    if not parts:
        return None, None, None
    if len(parts) == 1:
        return None, None, parts[0]
    last = parts[-1]
    first = " ".join(parts[:-1])
    return first, last, None


def extract_results_from_response(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    results = payload.get("results")
    if not isinstance(results, list):
        return []
    return [r for r in results if isinstance(r, dict)]


def result_profile_key(result: dict[str, Any]) -> str | None:
    social = result.get("socialLinks")
    if isinstance(social, dict):
        linkedin = (social.get("linkedin") or "").strip()
        if linkedin:
            return linkedin
    rid = result.get("id")
    if rid is not None and str(rid).strip():
        return f"lusha:{rid}"
    fn = (result.get("firstName") or "").strip()
    ln = (result.get("lastName") or "").strip()
    if fn or ln:
        return f"lusha:name:{fn} {ln}".strip()
    return None


def is_empty_search_marker(payload: Any) -> bool:
    return isinstance(payload, dict) and payload.get("_lushaEmptySearch") is True
