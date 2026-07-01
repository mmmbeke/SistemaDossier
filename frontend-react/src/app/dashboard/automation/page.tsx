"use client";

import { useCallback, useEffect, useState } from "react";
import AutomationCalendarPreview from "@/components/dashboard/AutomationCalendarPreview";
import DashboardCard from "@/components/dashboard/DashboardCard";
import UiAlert from "@/components/ui/UiAlert";
import TopBar from "@/components/dashboard/TopBar";
import {
  DossierApiError,
  fetchCalendarAutomationStatus,
  getStoredAccessToken,
  patchCalendarAutomationSettings,
} from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";
import type { TranslationKey } from "@/i18n/types";

const BEFORE_OPTIONS: { value: string; key: TranslationKey }[] = [
  { value: "15", key: "time.15_min" },
  { value: "20", key: "time.20_min" },
  { value: "30", key: "time.30_min" },
  { value: "60", key: "time.1_hour" },
  { value: "1440", key: "time.1_day" },
];

const selectClass =
  "w-full max-w-xs rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:ring-2";

const selectStyle = {
  backgroundColor: "var(--bg-input)",
  borderColor: "var(--border-default)",
  color: "var(--text-primary)",
};

export default function AutomationPage() {
  const { t } = useTranslation();
  const [beforeMinutes, setBeforeMinutes] = useState("20");
  const [hasCalendars, setHasCalendars] = useState(false);
  const [scheduledEvents, setScheduledEvents] = useState(0);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [load, setLoad] = useState<"idle" | "loading" | "ready">("idle");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setLoad("idle");
      return;
    }
    setLoad("loading");
    setErr(null);
    try {
      const st = await fetchCalendarAutomationStatus();
      setEnabled(st.enabled);
      setHasCalendars(Boolean(st.has_calendars ?? (st.integrations?.length ?? 0) > 0));
      const stored = st.advance_minutes_stored ?? st.advance_minutes;
      setBeforeMinutes(String(stored));
      setScheduledEvents(st.scheduled_events);
      setNextDue(st.next_due);
      setLoad("ready");
    } catch (e) {
      setErr(e instanceof DossierApiError ? e.message : String(e));
      setLoad("ready");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadStatus());
  }, [loadStatus]);

  async function handleAdvanceChange(value: string) {
    if (!hasCalendars) return;
    setBeforeMinutes(value);
    setSaveMsg(null);
    setSaving(true);
    setErr(null);
    try {
      const res = await patchCalendarAutomationSettings(Number(value));
      setSaveMsg(res.message);
      void loadStatus();
    } catch (e) {
      setErr(e instanceof DossierApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const selectDisabled = saving || load === "loading" || !hasCalendars;

  return (
    <>
      <TopBar title={t("automation.title")} subtitle={t("automation.subtitle")} />

      {err ? (
        <UiAlert variant="warning" className="mb-4" role="alert">
          {err}
        </UiAlert>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DashboardCard title={t("automation.connected_calendars")}>
            <AutomationCalendarPreview />
          </DashboardCard>
        </div>

        <DashboardCard title={t("automation.rules_title")}>
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {t("automation.rules_desc")}
            </p>

            {!hasCalendars && load === "ready" ? (
              <p
                className="rounded-lg border border-dashed px-3 py-2 text-xs"
                style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
              >
                {t("automation.connect_calendar_hint")}
              </p>
            ) : null}

            <label className="flex flex-col gap-1.5 text-sm">
              <span style={{ color: "var(--text-secondary)" }}>
                {t("automation.before_meeting")}
              </span>
              <select
                value={beforeMinutes}
                disabled={selectDisabled}
                onChange={(e) => void handleAdvanceChange(e.target.value)}
                className={selectClass}
                style={selectStyle}
              >
                {BEFORE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.key)}
                  </option>
                ))}
              </select>
            </label>

            {saving ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("automation.saving")}
              </p>
            ) : null}
            {saveMsg ? (
              <p className="text-xs" style={{ color: "#34d399" }}>
                {saveMsg}
              </p>
            ) : null}

            {load === "ready" && hasCalendars ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("automation.advance_effective", { minutes: beforeMinutes })}
              </p>
            ) : null}

            {load === "ready" ? (
              <div
                className="rounded-lg border px-3 py-3 text-xs"
                style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
              >
                <p>
                  {enabled ? t("automation.status_on") : t("automation.status_off")}
                </p>
                <p className="mt-1">
                  {t("automation.queue_summary", {
                    count: String(scheduledEvents),
                    next: nextDue
                      ? new Date(nextDue).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—",
                  })}
                </p>
              </div>
            ) : null}
          </div>
        </DashboardCard>
      </div>
    </>
  );
}
