"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import {
  DossierApiError,
  fetchGoogleCalendarEventos,
  fetchGoogleIntegrationStartAsJson,
  fetchMicrosoftIntegrationStartAsJson,
  fetchOutlookCalendarEventos,
  getStoredAccessToken,
  type OutlookReunionApi,
} from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";
import type { Locale } from "@/i18n/types";

type Provider = "google" | "outlook";

type MeetingRow = OutlookReunionApi & { provider: Provider };

function localeToBcp47(locale: Locale): string {
  switch (locale) {
    case "es":
      return "es-ES";
    case "pt":
      return "pt-PT";
    case "fr":
      return "fr-FR";
    case "de":
      return "de-DE";
    case "it":
      return "it-IT";
    case "en-gb":
      return "en-GB";
    default:
      return "en-US";
  }
}

function formatWhen(inicio: string, fin: string, bcp47: string): { day: string; time: string } {
  const si = Date.parse(inicio);
  if (Number.isNaN(si)) {
    return { day: (inicio || "—").slice(0, 16), time: "" };
  }
  const d0 = new Date(si);
  const fi = Date.parse(fin);
  const d1 = Number.isNaN(fi) ? null : new Date(fi);
  try {
    const day = d0.toLocaleDateString(bcp47, { weekday: "short", day: "numeric", month: "short" });
    const t0 = d0.toLocaleTimeString(bcp47, { hour: "2-digit", minute: "2-digit" });
    const t1 = d1 ? d1.toLocaleTimeString(bcp47, { hour: "2-digit", minute: "2-digit" }) : "";
    return { day, time: t1 ? `${t0} – ${t1}` : t0 };
  } catch {
    return { day: d0.toISOString().slice(0, 10), time: "" };
  }
}

function providerColor(provider: Provider): string {
  return provider === "google" ? "#4285f4" : "#0078d4";
}

export default function AutomationCalendarPreview() {
  const { t, locale } = useTranslation();
  const bcp47 = localeToBcp47(locale);

  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [outlookConnected, setOutlookConnected] = useState<boolean | null>(null);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [load, setLoad] = useState<"idle" | "loading" | "ready">("idle");
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadCalendars = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setGoogleConnected(false);
      setOutlookConnected(false);
      setMeetings([]);
      setLoad("idle");
      return;
    }
    setLoad("loading");
    setErr(null);
    const merged: MeetingRow[] = [];
    let gOk = false;
    let oOk = false;

    try {
      const g = await fetchGoogleCalendarEventos({ top: 12 });
      gOk = true;
      merged.push(...g.reuniones.map((r) => ({ ...r, provider: "google" as const })));
    } catch (e) {
      if (!(e instanceof DossierApiError && e.status === 404)) {
        setErr(e instanceof DossierApiError ? e.message : t("automation.calendar_load_error"));
      }
    }

    try {
      const o = await fetchOutlookCalendarEventos({ top: 12 });
      oOk = true;
      merged.push(...o.reuniones.map((r) => ({ ...r, provider: "outlook" as const })));
    } catch (e) {
      if (!(e instanceof DossierApiError && e.status === 404)) {
        setErr((prev) => prev || (e instanceof DossierApiError ? e.message : t("automation.calendar_load_error")));
      }
    }

    merged.sort((a, b) => Date.parse(a.inicio ?? "") - Date.parse(b.inicio ?? ""));
    setGoogleConnected(gOk);
    setOutlookConnected(oOk);
    setMeetings(merged.slice(0, 14));
    setLoad("ready");
  }, [t]);

  useEffect(() => {
    queueMicrotask(() => void loadCalendars());
  }, [loadCalendars]);

  async function connect(provider: Provider) {
    setConnecting(provider);
    setErr(null);
    try {
      const { authorize_url } =
        provider === "google"
          ? await fetchGoogleIntegrationStartAsJson()
          : await fetchMicrosoftIntegrationStartAsJson();
      window.location.href = authorize_url;
    } catch (e) {
      setConnecting(null);
      setErr(e instanceof DossierApiError ? e.message : t("automation.calendar_load_error"));
    }
  }

  const anyConnected = googleConnected || outlookConnected;

  const groupedByDay = useMemo(() => {
    const map = new Map<string, MeetingRow[]>();
    for (const m of meetings) {
      const key = formatWhen(m.inicio ?? "", m.fin ?? "", bcp47).day;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()];
  }, [meetings, bcp47]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
          style={{
            borderColor: googleConnected ? "rgba(66,133,244,0.45)" : "var(--border-default)",
            color: googleConnected ? "#4285f4" : "var(--text-muted)",
          }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#4285f4" }} />
          Google {googleConnected ? "✓" : "—"}
        </span>
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
          style={{
            borderColor: outlookConnected ? "rgba(0,120,212,0.45)" : "var(--border-default)",
            color: outlookConnected ? "#0078d4" : "var(--text-muted)",
          }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#0078d4" }} />
          Outlook {outlookConnected ? "✓" : "—"}
        </span>
        {!googleConnected ? (
          <PrimaryButton
            type="button"
            className="!px-3 !py-1.5 !text-xs"
            loading={connecting === "google"}
            onClick={() => void connect("google")}
          >
            {t("overview.google_connect")}
          </PrimaryButton>
        ) : null}
        {!outlookConnected ? (
          <PrimaryButton
            type="button"
            className="!px-3 !py-1.5 !text-xs"
            loading={connecting === "outlook"}
            onClick={() => void connect("outlook")}
          >
            {t("overview.microsoft_connect")}
          </PrimaryButton>
        ) : null}
      </div>

      {err ? (
        <p className="ui-text-warning text-xs" role="alert">
          {err}
        </p>
      ) : null}

      {load === "loading" ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("automation.calendar_loading")}
        </p>
      ) : null}

      {load === "ready" && !anyConnected ? (
        <div
          className="rounded-xl border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
        >
          {t("automation.calendars_empty")}
        </div>
      ) : null}

      {load === "ready" && anyConnected && meetings.length === 0 ? (
        <div
          className="rounded-xl border px-4 py-6 text-center text-sm"
          style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
        >
          {t("automation.no_upcoming_events")}
        </div>
      ) : null}

      {meetings.length > 0 ? (
        <div className="flex flex-col gap-4">
          {groupedByDay.map(([dayLabel, dayMeetings]) => (
            <div key={dayLabel}>
              <p
                className="mb-2 text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-subtle)" }}
              >
                {dayLabel}
              </p>
              <ul className="flex flex-col gap-2">
                {dayMeetings.map((m) => {
                  const when = formatWhen(m.inicio ?? "", m.fin ?? "", bcp47);
                  return (
                    <li
                      key={`${m.provider}-${m.id}`}
                      className="flex gap-3 rounded-lg border px-3 py-2.5"
                      style={{
                        borderColor: "var(--border-default)",
                        backgroundColor: "var(--bg-surface)",
                      }}
                    >
                      <div
                        className="mt-0.5 w-1 shrink-0 self-stretch rounded-full"
                        style={{ backgroundColor: providerColor(m.provider) }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                          {m.tema || "—"}
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {when.time}
                          {m.ubicacion ? ` · ${m.ubicacion}` : ""}
                        </p>
                      </div>
                      <span
                        className="shrink-0 self-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                        style={{
                          color: providerColor(m.provider),
                          backgroundColor: `${providerColor(m.provider)}18`,
                        }}
                      >
                        {m.provider === "google" ? "G" : "O"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
