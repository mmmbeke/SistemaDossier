import type en from "@/i18n/messages/en";

export type TranslationKey = keyof typeof en;

export type Locale = "en" | "en-gb" | "es" | "pt" | "it" | "fr" | "de";

export type ThemeChoice = "dark" | "light" | "system";

export type DateFormat = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd";

export type OutputLanguage = "auto" | "en" | "match";

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
