"use client";

import DashboardCard from "@/components/dashboard/DashboardCard";
import { usePreferences } from "@/providers/PreferencesProvider";
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  type DateFormat,
  type Locale,
  type OutputLanguage,
  type TranslationKey,
} from "@/i18n/types";

const selectClass =
  "w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:ring-2";

const selectStyle = {
  backgroundColor: "var(--bg-input)",
  borderColor: "var(--border-default)",
  color: "var(--text-primary)",
};

const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: "dd/mm/yyyy", label: "DD/MM/YYYY" },
  { value: "mm/dd/yyyy", label: "MM/DD/YYYY" },
  { value: "yyyy-mm-dd", label: "YYYY-MM-DD" },
];

const OUTPUT_OPTIONS: { value: OutputLanguage; labelKey: TranslationKey }[] = [
  { value: "auto", labelKey: "output.auto" },
  { value: "en", labelKey: "output.english" },
  { value: "match", labelKey: "output.match" },
];

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
            className={selectClass}
            style={selectStyle}
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
            className={selectClass}
            style={selectStyle}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
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
            className={selectClass}
            style={selectStyle}
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
            className={selectClass}
            style={selectStyle}
          >
            {OUTPUT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
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
