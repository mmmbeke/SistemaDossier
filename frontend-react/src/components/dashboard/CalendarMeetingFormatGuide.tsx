"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CALENDAR_MEETING_FORMAT_EXAMPLE,
  CALENDAR_MEETING_SUBJECT_EXAMPLES,
} from "@/lib/calendar-meeting-format";
import { useTranslation } from "@/providers/PreferencesProvider";

type Props = {
  /** Abre el modal al montar (p. ej. aviso de descripción incompleta). */
  defaultOpen?: boolean;
  /** `button`: botón suelto; `inline`: enlace compacto bajo un evento. */
  variant?: "button" | "inline";
};

function GuideContent({
  copied,
  onCopy,
  compact,
}: {
  copied: boolean;
  onCopy: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={compact ? "space-y-3 text-xs" : "space-y-4 text-sm"}
      style={{ color: "var(--text-muted)" }}
    >
      <p className="leading-relaxed">{t("calendar.guide.intro")}</p>

      <div>
        <p className="mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>
          {t("calendar.guide.template_title")}
        </p>
        <pre
          className={
            compact
              ? "overflow-x-auto whitespace-pre-wrap rounded-lg border px-3 py-2 font-mono text-[11px] leading-relaxed"
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
          onClick={onCopy}
          className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ui-hover-surface"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-secondary)",
            backgroundColor: "var(--bg-panel-muted)",
          }}
        >
          {copied ? t("calendar.guide.copied") : t("calendar.guide.copy")}
        </button>
      </div>

      <div>
        <p className="mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>
          {t("calendar.guide.fields_title")}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("calendar.guide.field_company")}</li>
          <li>{t("calendar.guide.field_contact")}</li>
          <li>{t("calendar.guide.field_job")}</li>
          <li>{t("calendar.guide.field_email")}</li>
          <li>{t("calendar.guide.field_country")}</li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>
          {t("calendar.guide.subject_title")}
        </p>
        <p className="leading-relaxed">{t("calendar.guide.subject_hint")}</p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 font-mono text-xs">
          {CALENDAR_MEETING_SUBJECT_EXAMPLES.map((ex) => (
            <li key={ex}>{ex}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function GuideModal({ onClose }: { onClose: () => void }) {
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-guide-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label={t("calendar.guide.close")}
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-2xl"
        style={{
          borderColor: "var(--border-strong)",
          backgroundColor: "var(--bg-panel)",
          boxShadow: "0 20px 48px rgba(10, 20, 40, 0.28)",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--border-default)" }}
        >
          <h2
            id="calendar-guide-title"
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {t("calendar.guide.summary")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none transition ui-hover-surface"
            style={{ color: "var(--text-muted)" }}
            aria-label={t("calendar.guide.close")}
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <GuideContent copied={copied} onCopy={() => void onCopy()} />
        </div>
        <div
          className="shrink-0 border-t px-5 py-3 text-right"
          style={{ borderColor: "var(--border-default)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition ui-hover-surface"
            style={{
              borderColor: "var(--border-default)",
              color: "var(--text-primary)",
              backgroundColor: "var(--bg-panel-muted)",
            }}
          >
            {t("calendar.guide.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CalendarMeetingFormatGuide({
  defaultOpen = false,
  variant = "button",
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const trigger =
    variant === "inline" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-left text-xs font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--alert-info-text)" }}
      >
        {t("calendar.guide.open_inline")}
      </button>
    ) : (
      <span className="group relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("calendar.guide.summary")}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-panel-muted)] text-sm font-semibold leading-none text-[var(--text-muted)] transition ui-hover-surface group-hover:border-[var(--accent-from)] group-hover:text-[var(--accent-from)]"
        >
          ?
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute right-full top-1/2 z-20 mr-2 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-panel)",
            color: "var(--text-primary)",
            boxShadow: "0 8px 24px rgba(10, 20, 40, 0.18)",
          }}
        >
          {t("calendar.guide.summary")}
        </span>
      </span>
    );

  return (
    <>
      {trigger}
      {open ? <GuideModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
