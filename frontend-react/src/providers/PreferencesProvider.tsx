"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createTranslator, type TranslateFn } from "@/i18n";
import type {
  DateFormat,
  Locale,
  OutputLanguage,
  ThemeChoice,
  TranslationKey,
  UserPreferences,
} from "@/i18n/types";
import { DEFAULT_PREFERENCES } from "@/i18n/types";
import { applyTheme } from "@/lib/theme";

const STORAGE_KEY = "dossier-preferences";

type PreferencesContextValue = {
  preferences: UserPreferences;
  t: TranslateFn;
  locale: Locale;
  setTheme: (theme: ThemeChoice) => void;
  setLocale: (locale: Locale) => void;
  setTimezone: (timezone: string) => void;
  setDateFormat: (format: DateFormat) => void;
  setOutputLanguage: (lang: OutputLanguage) => void;
  setDossierExpiry: (expiry: string) => void;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function loadPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const merged = { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) } as UserPreferences;
      // «auto» = español fijo; con UI no española suele ser un error de expectativa.
      if (
        merged.outputLanguage === "auto" &&
        merged.locale !== "es"
      ) {
        merged.outputLanguage = "match";
      }
      return merged;
    }
    const legacyTheme = localStorage.getItem("dossier-theme") as ThemeChoice | null;
    if (legacyTheme) {
      return { ...DEFAULT_PREFERENCES, theme: legacyTheme };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFERENCES;
}

function savePreferences(prefs: UserPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  localStorage.setItem("dossier-theme", prefs.theme);
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = loadPreferences();
    setPreferences(loaded);
    applyTheme(loaded.theme);
    document.documentElement.lang = loaded.locale;
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    savePreferences(preferences);
    applyTheme(preferences.theme);
    document.documentElement.lang = preferences.locale;
  }, [preferences, ready]);

  useEffect(() => {
    if (!ready || preferences.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preferences.theme, ready]);

  const updatePreferences = useCallback((patch: Partial<UserPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...patch }));
  }, []);

  const t = useMemo(
    () => createTranslator(preferences.locale),
    [preferences.locale]
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      t,
      locale: preferences.locale,
      setTheme: (theme) => updatePreferences({ theme }),
      setLocale: (locale) => updatePreferences({ locale }),
      setTimezone: (timezone) => updatePreferences({ timezone }),
      setDateFormat: (dateFormat) => updatePreferences({ dateFormat }),
      setOutputLanguage: (outputLanguage) =>
        updatePreferences({ outputLanguage }),
      setDossierExpiry: (dossierExpiry) => updatePreferences({ dossierExpiry }),
      updatePreferences,
    }),
    [preferences, t, updatePreferences]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return ctx;
}

export function useTranslation() {
  const { t, locale, preferences, setLocale } = usePreferences();
  return { t, locale, preferences, setLocale };
}

export type { TranslationKey };
