import type { Locale } from "@/i18n/types";
import { normalizeAppLocale } from "@/i18n/types";

/** Etiquetas del listado de calendario (automatización) — mapa fijo por idioma. */
export type CalendarUiLabels = {
  filterAll: string;
  filterOutlook: string;
  filterGoogle: string;
  refresh: string;
  loading: string;
  meetingsHeading: string;
  pastBadge: string;
  location: string;
  allDay: string;
};

const LABELS: Record<Locale, CalendarUiLabels> = {
  en: {
    filterAll: "All",
    filterOutlook: "Outlook",
    filterGoogle: "Google Calendar",
    refresh: "Refresh",
    loading: "Loading meetings…",
    meetingsHeading: "Upcoming meetings",
    pastBadge: "Past",
    location: "Location",
    allDay: "All day",
  },
  "en-gb": {
    filterAll: "All",
    filterOutlook: "Outlook",
    filterGoogle: "Google Calendar",
    refresh: "Refresh",
    loading: "Loading meetings…",
    meetingsHeading: "Upcoming meetings",
    pastBadge: "Past",
    location: "Location",
    allDay: "All day",
  },
  es: {
    filterAll: "Todas",
    filterOutlook: "Outlook",
    filterGoogle: "Google Calendar",
    refresh: "Actualizar",
    loading: "Cargando reuniones…",
    meetingsHeading: "Próximas reuniones",
    pastBadge: "Pasada",
    location: "Ubicación",
    allDay: "Todo el día",
  },
  de: {
    filterAll: "Alle",
    filterOutlook: "Outlook",
    filterGoogle: "Google Kalender",
    refresh: "Aktualisieren",
    loading: "Meetings werden geladen…",
    meetingsHeading: "Anstehende Meetings",
    pastBadge: "Vergangen",
    location: "Ort",
    allDay: "Ganztägig",
  },
  fr: {
    filterAll: "Toutes",
    filterOutlook: "Outlook",
    filterGoogle: "Google Calendar",
    refresh: "Actualiser",
    loading: "Chargement des réunions…",
    meetingsHeading: "Réunions à venir",
    pastBadge: "Passée",
    location: "Lieu",
    allDay: "Toute la journée",
  },
  it: {
    filterAll: "Tutte",
    filterOutlook: "Outlook",
    filterGoogle: "Google Calendar",
    refresh: "Aggiorna",
    loading: "Caricamento riunioni…",
    meetingsHeading: "Riunioni imminenti",
    pastBadge: "Passata",
    location: "Luogo",
    allDay: "Tutto il giorno",
  },
  pt: {
    filterAll: "Todas",
    filterOutlook: "Outlook",
    filterGoogle: "Google Calendar",
    refresh: "Atualizar",
    loading: "A carregar reuniões…",
    meetingsHeading: "Reuniões próximas",
    pastBadge: "Passada",
    location: "Local",
    allDay: "Dia inteiro",
  },
};

export function calendarUiLabels(locale: string | Locale): CalendarUiLabels {
  return LABELS[normalizeAppLocale(locale)] ?? LABELS.en;
}
