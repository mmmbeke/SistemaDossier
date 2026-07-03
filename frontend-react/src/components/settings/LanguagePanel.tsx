"use client";

import DashboardCard from "@/components/dashboard/DashboardCard";
import { usePreferences } from "@/providers/PreferencesProvider";
import {
  DOSSIER_OUTPUT_LANGUAGE_CODES,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  type DateFormat,
  type DossierOutputLanguageCode,
  type Locale,
  type OutputLanguage,
} from "@/i18n/types";

const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: "dd/mm/yyyy", label: "DD/MM/YYYY" },
  { value: "mm/dd/yyyy", label: "MM/DD/YYYY" },
  { value: "yyyy-mm-dd", label: "YYYY-MM-DD" },
];

const OUTPUT_LANGUAGE_LABELS: Record<DossierOutputLanguageCode, string> = {
  es: LOCALE_LABELS.es,
  en: LOCALE_LABELS.en,
  pt: LOCALE_LABELS.pt,
  it: LOCALE_LABELS.it,
  fr: LOCALE_LABELS.fr,
  de: LOCALE_LABELS.de,
};

const TIMEZONES = [
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
];

export default function LanguagePanel() {
  const {
    t,
    preferences,
    setLocale,
    setTimezone,
    setDateFormat,
    setOutputLanguage,
  } = usePreferences();

  return (
    <DashboardCard title={t("settings.language_title")}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span style={{ color: "var(--text-secondary)" }}>
            {t("settings.display_language")}
          </span>
          <select
            value={preferences.locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="ui-settings-select"
          >
            {SUPPORTED_LOCALES.map((loc) => (
              <option key={loc} value={loc}>
                {LOCALE_LABELS[loc]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span style={{ color: "var(--text-secondary)" }}>
            {t("settings.timezone")}
          </span>
          <select
            value={preferences.timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="ui-settings-select"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span style={{ color: "var(--text-secondary)" }}>
            {t("settings.date_format")}
          </span>
          <select
            value={preferences.dateFormat}
            onChange={(e) => setDateFormat(e.target.value as DateFormat)}
            className="ui-settings-select"
          >
            {DATE_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span style={{ color: "var(--text-secondary)" }}>
            {t("settings.output_language")}
          </span>
          <select
            value={preferences.outputLanguage}
            onChange={(e) => setOutputLanguage(e.target.value as OutputLanguage)}
            className="ui-settings-select"
          >
            <option value="match">{t("output.match")}</option>
            {DOSSIER_OUTPUT_LANGUAGE_CODES.map((code) => (
              <option key={code} value={code}>
                {OUTPUT_LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-4 text-xs" style={{ color: "var(--text-subtle)" }}>
        {t("settings.output_hint")}
      </p>
    </DashboardCard>
  );
}
