import type { Locale, OutputLanguage, UserPreferences } from "@/i18n/types";

/** Códigos que el backend normaliza para prompts de dossier. */
export type DossierOutputLanguageCode = "es" | "en" | "pt" | "it" | "fr" | "de";

function localeToOutputCode(locale: Locale): DossierOutputLanguageCode {
  switch (locale) {
    case "en":
    case "en-gb":
      return "en";
    case "pt":
      return "pt";
    case "it":
      return "it";
    case "fr":
      return "fr";
    case "de":
      return "de";
    default:
      return "es";
  }
}

/**
 * Resuelve el idioma de salida según Configuración → Idioma y Región.
 *
 * - `match`: mismo idioma que la interfaz (`locale`).
 * - `en`: siempre inglés.
 * - `auto`: español fijo (modo histórico del producto).
 */
export function resolveDossierOutputLanguage(
  prefs: Pick<UserPreferences, "locale" | "outputLanguage">
): DossierOutputLanguageCode {
  if (prefs.outputLanguage === "en") {
    return "en";
  }
  if (prefs.outputLanguage === "match") {
    return localeToOutputCode(prefs.locale);
  }
  return "es";
}
