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

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function isOutputLanguagePref(value: string): value is OutputLanguage {
  return (OUTPUT_LANGUAGE_PREFS as readonly string[]).includes(value);
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
  return patch;
}

export function preferencesToAuthPatch(
  prefs: Pick<UserPreferences, "locale" | "timezone" | "outputLanguage">
): {
  locale: string;
  timezone: string;
  dossier_output_language: string;
} {
  return {
    locale: prefs.locale,
    timezone: prefs.timezone,
    dossier_output_language: prefs.outputLanguage,
  };
}
