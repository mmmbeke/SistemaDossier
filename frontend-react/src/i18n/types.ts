import type en from "@/i18n/messages/en";

export type TranslationKey = keyof typeof en;

export type Locale = "en" | "en-gb" | "es" | "pt" | "it" | "fr" | "de";

export type ThemeChoice = "dark" | "light" | "system";

export type DateFormat = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd";

/** Códigos de idioma que el backend usa en los prompts de dossier. */
export type DossierOutputLanguageCode = "es" | "en" | "pt" | "it" | "fr" | "de";

/** `match` = idioma de interfaz; `auto` = español (legado en localStorage). */
export type OutputLanguage = "match" | DossierOutputLanguageCode | "auto";

export const DOSSIER_OUTPUT_LANGUAGE_CODES: DossierOutputLanguageCode[] = [
  "es",
  "en",
  "pt",
  "it",
  "fr",
  "de",
];

export type UserPreferences = {
  theme: ThemeChoice;
  locale: Locale;
  timezone: string;
  dateFormat: DateFormat;
  outputLanguage: OutputLanguage;
  dossierExpiry: string;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  locale: "es",
  timezone: "Europe/London",
  dateFormat: "dd/mm/yyyy",
  outputLanguage: "match",
  dossierExpiry: "30",
};

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English (US)",
  "en-gb": "English (UK)",
  es: "Español",
  pt: "Português",
  it: "Italiano",
  fr: "Français",
  de: "Deutsch",
};

export const SUPPORTED_LOCALES: Locale[] = [
  "en",
  "en-gb",
  "es",
  "pt",
  "it",
  "fr",
  "de",
];
