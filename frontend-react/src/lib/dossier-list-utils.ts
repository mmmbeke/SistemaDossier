import type { FilterValue } from "@/components/dossier/FilterTabs";
import { getCalendarMeetingLabel } from "@/lib/calendar-dossier-meta";
import {
  isDossierFolderEntry,
  type DossierListEntry,
  type DossierListItem,
} from "@/lib/dossier-api";

export function entryMatchesFilter(entry: DossierListEntry, filter: FilterValue): boolean {
  if (filter === "all") return true;
  if (isDossierFolderEntry(entry)) {
    if (filter === "complete") return entry.dossiers.every((d) => d.status === "complete");
    return entry.dossiers.some((d) => d.status !== "complete");
  }
  if (filter === "complete") return entry.status === "complete";
  return entry.status !== "complete";
}

export function entryMatchesQuery(entry: DossierListEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (isDossierFolderEntry(entry)) {
    const title = (entry.title || "").toLowerCase();
    const meeting = (getCalendarMeetingLabel(entry) || "").toLowerCase();
    if (title.includes(q) || meeting.includes(q)) return true;
    return entry.dossiers.some((d) => dossierMatchesQuery(d, q));
  }
  return dossierMatchesQuery(entry, q);
}

function dossierMatchesQuery(row: DossierListItem, q: string): boolean {
  const name = (row.subject_name || "").toLowerCase();
  const mail = (row.subject_email || "").toLowerCase();
  let companyFromPerson = "";
  const dd = row.dossier_data;
  if (dd && typeof dd === "object" && !Array.isArray(dd)) {
    const pf = (dd as Record<string, unknown>).person_filters;
    if (pf && typeof pf === "object" && !Array.isArray(pf)) {
      const c = (pf as Record<string, unknown>).company;
      if (typeof c === "string") companyFromPerson = c.toLowerCase();
    }
  }
  const meeting = (getCalendarMeetingLabel(row) || "").toLowerCase();
  return (
    name.includes(q) ||
    mail.includes(q) ||
    companyFromPerson.includes(q) ||
    meeting.includes(q)
  );
}

export function countListEntries(items: DossierListEntry[]): {
  all: number;
  complete: number;
  needs_update: number;
} {
  let complete = 0;
  let needs_update = 0;
  for (const entry of items) {
    if (isDossierFolderEntry(entry)) {
      const allComplete = entry.dossiers.every((d) => d.status === "complete");
      if (allComplete) complete += 1;
      else needs_update += 1;
    } else if (entry.status === "complete") {
      complete += 1;
    } else {
      needs_update += 1;
    }
  }
  return { all: items.length, complete, needs_update };
}
