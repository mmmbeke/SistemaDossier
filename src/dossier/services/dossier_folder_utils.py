"""Utilidades para carpetas de dossiers (empresa + persona del mismo evento)."""
from __future__ import annotations

from typing import Any

from dossier.db.models import Dossier
from dossier.services.calendar_event_dossiers import calendar_meeting_summary_from_dossier_data


def dossier_module_kind(d: Dossier) -> str:
    if d.module_corporate and not d.module_identity:
        return "corporate"
    if d.module_identity and not d.module_corporate:
        return "person"
    return "mixed"


def folder_title_from_dossier(d: Dossier) -> str | None:
    data = d.dossier_data if isinstance(d.dossier_data, dict) else {}
    cf = data.get("calendar_folder")
    if isinstance(cf, dict):
        title = cf.get("title")
        if isinstance(title, str) and title.strip():
            return title.strip()[:255]
    cal = data.get("calendar")
    if isinstance(cal, dict):
        label = cal.get("meeting_label") or cal.get("tema")
        if isinstance(label, str) and label.strip():
            return label.strip()[:255]
    return None


def serialize_dossier_list_item(d: Dossier) -> dict[str, Any]:
    data = d.dossier_data if isinstance(d.dossier_data, dict) else None
    return {
        "type": "dossier",
        "id": str(d.id),
        "subject_name": d.subject_name,
        "subject_email": d.subject_email,
        "status": d.status,
        "status_message": d.status_message,
        "depth_level": d.depth_level,
        "credits_consumed": d.credits_consumed,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        "dossier_data": d.dossier_data,
        "trigger_source": d.trigger_source,
        "module_kind": dossier_module_kind(d),
        "dossier_folder_id": str(d.dossier_folder_id) if d.dossier_folder_id else None,
        "calendar_meeting": calendar_meeting_summary_from_dossier_data(
            data,
            trigger_source=d.trigger_source,
        ),
    }


def _folder_status(members: list[Dossier]) -> str:
    if not members:
        return "pending"
    if all(m.status == "complete" for m in members):
        return "complete"
    if any(m.status == "failed" for m in members):
        return "failed"
    return members[0].status


def serialize_folder(members: list[Dossier]) -> dict[str, Any]:
    ordered = sorted(
        members,
        key=lambda m: (0 if dossier_module_kind(m) == "corporate" else 1, m.created_at or ""),
    )
    head = ordered[0]
    fid = head.dossier_folder_id
    title = folder_title_from_dossier(head) or head.subject_name or "Reunión"
    data = head.dossier_data if isinstance(head.dossier_data, dict) else None
    created = [m.created_at for m in members if m.created_at]
    updated = [m.updated_at for m in members if m.updated_at]
    return {
        "type": "folder",
        "id": str(fid),
        "title": title,
        "status": _folder_status(members),
        "created_at": max(created).isoformat() if created else None,
        "updated_at": max(updated).isoformat() if updated else None,
        "trigger_source": head.trigger_source,
        "calendar_meeting": calendar_meeting_summary_from_dossier_data(
            data,
            trigger_source=head.trigger_source,
        ),
        "dossiers": [serialize_dossier_list_item(m) for m in ordered],
    }


def build_dossier_list_entries(rows: list[Dossier]) -> list[dict[str, Any]]:
    """Agrupa dossiers con el mismo ``dossier_folder_id`` en entradas tipo carpeta."""
    by_folder: dict[str, list[Dossier]] = {}
    for row in rows:
        if row.dossier_folder_id:
            by_folder.setdefault(str(row.dossier_folder_id), []).append(row)

    emitted: set[str] = set()
    items: list[dict[str, Any]] = []
    for row in rows:
        fid = str(row.dossier_folder_id) if row.dossier_folder_id else None
        if fid:
            if fid in emitted:
                continue
            emitted.add(fid)
            items.append(serialize_folder(by_folder[fid]))
        else:
            items.append(serialize_dossier_list_item(row))
    return items
