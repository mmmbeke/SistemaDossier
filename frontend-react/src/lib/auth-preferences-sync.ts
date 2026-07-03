import type { AuthUser } from "@/lib/dossier-api";
import type { Locale, OutputLanguage, UserPreferences } from "@/i18n/types";
import { SUPPORTED_LOCALES } from "@/i18n/types";

const OUTPUT_LANGUAGE_PREFS: OutputLanguage[] = [
  "match",
  "auto",
  "es",
  "en",
  "pt",
  "it",
  "fr",
  "de",
];

const RETENTION_DAYS = new Set(["7", "14", "30", "90"]);

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function isOutputLanguagePref(value: string): value is OutputLanguage {
  return (OUTPUT_LANGUAGE_PREFS as readonly string[]).includes(value);
}

function retentionDaysToExpiry(days: number | null | undefined): string | undefined {
  if (days === null || days === undefined) {
    return "never";
  }
  const s = String(days);
  return RETENTION_DAYS.has(s) ? s : undefined;
}

/** Campos de preferencias que vienen del backend (`GET /auth/me`). */
export function authUserToPreferencesPatch(me: AuthUser): Partial<UserPreferences> {
  const patch: Partial<UserPreferences> = {};
  const loc = (me.locale || "").trim();
  if (loc && isLocale(loc)) {
    patch.locale = loc;
  }
  const tz = (me.timezone || "").trim();
  if (tz) {
    patch.timezone = tz;
  }
  const out = (me.dossier_output_language || "").trim();
  if (out && isOutputLanguagePref(out)) {
    patch.outputLanguage = out;
  }
  const expiry = retentionDaysToExpiry(me.dossier_retention_days);
  if (expiry) {
    patch.dossierExpiry = expiry;
  }
  return patch;
}

export function preferencesToAuthPatch(
  prefs: Pick<UserPreferences, "locale" | "timezone" | "outputLanguage" | "dossierExpiry">
): {
  locale: string;
  timezone: string;
  dossier_output_language: string;
  dossier_retention_days: number | null;
} {
  const raw = (prefs.dossierExpiry || "30").trim();
  const dossier_retention_days =
    raw === "never" ? null : RETENTION_DAYS.has(raw) ? Number(raw) : 30;
  return {
    locale: prefs.locale,
    timezone: prefs.timezone,
    dossier_output_language: prefs.outputLanguage,
    dossier_retention_days,
  };
}
