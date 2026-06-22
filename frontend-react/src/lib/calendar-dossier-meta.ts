/** Metadatos de reunión guardados en `dossier_data.calendar`. */
export type CalendarDossierMeta = {
  provider?: string;
  external_event_id?: string;
  tema?: string;
  inicio?: string;
  fin?: string;
  meeting_label?: string;
};

function readCalendarBlock(dossierData: unknown): CalendarDossierMeta | null {
  if (!dossierData || typeof dossierData !== "object" || Array.isArray(dossierData)) {
    return null;
  }
  const cal = (dossierData as Record<string, unknown>).calendar;
  if (!cal || typeof cal !== "object" || Array.isArray(cal)) return null;
  return cal as CalendarDossierMeta;
}

function formatMeetingStart(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function buildMeetingLabelFromBlock(cal: CalendarDossierMeta): string | null {
  const explicit = cal.meeting_label?.trim();
  if (explicit) return explicit;
  const tema = cal.tema?.trim();
  if (!tema) return null;
  const when = formatMeetingStart(cal.inicio);
  return when ? `${tema} · ${when}` : tema;
}

/** Etiqueta legible de la reunión de calendario asociada al dossier. */
export function getCalendarMeetingLabel(dossier: {
  trigger_source?: string | null;
  calendar_meeting?: string | null;
  dossier_data?: unknown;
}): string | null {
  const fromApi = dossier.calendar_meeting?.trim();
  if (fromApi) return fromApi;

  const source = (dossier.trigger_source || "").trim();
  const cal = readCalendarBlock(dossier.dossier_data);
  if (!cal && source !== "calendar") return null;
  if (!cal) return null;

  return buildMeetingLabelFromBlock(cal);
}

export function isCalendarDossier(dossier: {
  trigger_source?: string | null;
  dossier_data?: unknown;
}): boolean {
  if ((dossier.trigger_source || "").trim() === "calendar") return true;
  return readCalendarBlock(dossier.dossier_data) !== null;
}

export function getCalendarProviderLabel(provider: string | undefined): string | null {
  const p = (provider || "").trim().toLowerCase();
  if (p === "google") return "Google Calendar";
  if (p === "microsoft" || p === "outlook") return "Outlook";
  return provider?.trim() || null;
}

export { readCalendarBlock as readCalendarBlockFromData };
