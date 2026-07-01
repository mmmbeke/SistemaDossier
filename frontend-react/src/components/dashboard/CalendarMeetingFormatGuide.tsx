"use client";

import { useCallback, useState } from "react";
import {
  CALENDAR_MEETING_FORMAT_EXAMPLE,
  CALENDAR_MEETING_SUBJECT_EXAMPLES,
} from "@/lib/calendar-meeting-format";
import { useTranslation } from "@/providers/PreferencesProvider";

type Props = {
  /** Abre el bloque al montar (útil junto a avisos de descripción incompleta). */
  defaultOpen?: boolean;
  /** `card`: panel general; `inline`: compacto bajo un evento. */
  variant?: "card" | "inline";
};

export default function CalendarMeetingFormatGuide({
  defaultOpen = false,
  variant = "card",
}: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(CALENDAR_MEETING_FORMAT_EXAMPLE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, []);

  const isInline = variant === "inline";

  return (
    <details
      open={defaultOpen}
      className={
        isInline
          ? "ui-alert ui-alert-info mt-2 px-3 py-2 text-xs"
          : "rounded-xl border px-4 py-3 text-sm"
      }
      style={
        isInline
          ? undefined
          : {
              borderColor: "var(--border-default)",
              backgroundColor: "var(--bg-surface)",
            }
      }
    >
      <summary
        className="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden"
        style={{ color: isInline ? "var(--alert-info-text)" : "var(--accent-from)" }}
      >
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="text-base leading-none">
            {isInline ? "ℹ️" : "📋"}
          </span>
          {t("calendar.guide.summary")}
        </span>
      </summary>

      <div
        className={isInline ? "mt-2 space-y-2" : "mt-3 space-y-3"}
        style={{ color: isInline ? "var(--text-secondary)" : "var(--text-muted)" }}
      >
        <p className={isInline ? "leading-relaxed" : "text-sm leading-relaxed"}>
          {t("calendar.guide.intro")}
        </p>

        <div>
          <p className="mb-1 font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("calendar.guide.template_title")}
          </p>
          <div className="relative">
            <pre
              className={
                isInline
                  ? "overflow-x-auto whitespace-pre-wrap rounded-md border px-2.5 py-2 font-mono text-[11px] leading-relaxed"
                  : "overflow-x-auto whitespace-pre-wrap rounded-lg border px-3 py-2.5 font-mono text-xs leading-relaxed"
              }
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-input)",
                color: "var(--text-primary)",
              }}
            >
              {CALENDAR_MEETING_FORMAT_EXAMPLE}
            </pre>
            <button
              type="button"
              onClick={() => void onCopy()}
              className={
                isInline
                  ? "mt-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition hover:opacity-90"
                  : "mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:opacity-90"
              }
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-secondary)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              {copied ? t("calendar.guide.copied") : t("calendar.guide.copy")}
            </button>
          </div>
        </div>

        <div>
          <p className="mb-1 font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("calendar.guide.fields_title")}
          </p>
          <ul className={isInline ? "list-disc space-y-0.5 pl-4" : "list-disc space-y-1 pl-5 text-sm"}>
            <li>{t("calendar.guide.field_company")}</li>
            <li>{t("calendar.guide.field_contact")}</li>
            <li>{t("calendar.guide.field_job")}</li>
            <li>{t("calendar.guide.field_email")}</li>
            <li>{t("calendar.guide.field_country")}</li>
          </ul>
        </div>

        <div>
          <p className="mb-1 font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("calendar.guide.subject_title")}
          </p>
          <p className={isInline ? "leading-relaxed" : "text-sm leading-relaxed"}>
            {t("calendar.guide.subject_hint")}
          </p>
          <ul
            className={
              isInline ? "mt-1 list-disc space-y-0.5 pl-4 font-mono text-[11px]" : "mt-1 list-disc space-y-0.5 pl-5 font-mono text-xs"
            }
          >
            {CALENDAR_MEETING_SUBJECT_EXAMPLES.map((ex) => (
              <li key={ex}>{ex}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
