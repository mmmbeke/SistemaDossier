import type { DateFormat, Locale, UserPreferences } from "@/i18n/types";

const LOCALE_MAP: Record<Locale, string> = {
  en: "en-US",
  "en-gb": "en-GB",
  es: "es-ES",
  pt: "pt-PT",
  it: "it-IT",
  fr: "fr-FR",
  de: "de-DE",
};

function intlLocale(locale: Locale): string {
  return LOCALE_MAP[locale] ?? "en-US";
}

export function formatDate(
  date: Date | string,
  prefs: Pick<UserPreferences, "locale" | "timezone" | "dateFormat">
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const loc = intlLocale(prefs.locale);

  if (prefs.dateFormat === "yyyy-mm-dd") {
    return new Intl.DateTimeFormat(loc, {
      timeZone: prefs.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(d)
      .replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2");
  }

  return new Intl.DateTimeFormat(loc, {
    timeZone: prefs.timezone,
    day: "numeric",
    month: prefs.dateFormat === "dd/mm/yyyy" ? "short" : "numeric",
    year: "numeric",
  }).format(d);
}

export function formatLongDate(
  date: Date | string,
  prefs: Pick<UserPreferences, "locale" | "timezone">
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(intlLocale(prefs.locale), {
    timeZone: prefs.timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
