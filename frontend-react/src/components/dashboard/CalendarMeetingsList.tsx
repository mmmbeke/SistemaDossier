"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import CalendarDossierPreview from "@/components/dashboard/CalendarDossierPreview";
import CalendarMeetingFormatGuide from "@/components/dashboard/CalendarMeetingFormatGuide";
import UiAlert from "@/components/ui/UiAlert";
import {
  DossierApiError,
  fetchCalendarDiagnostico,
  fetchGoogleCalendarEventos,
  fetchGoogleIntegrationStartAsJson,
  fetchMicrosoftIntegrationStartAsJson,
  fetchOutlookCalendarEventos,
  getStoredAccessToken,
  type CalendarGenerarDossierItem,
  type CalendarProvider,
  type CalendarSavedDossierRef,
  type OutlookReunionApi,
} from "@/lib/dossier-api";
import { formatMeetingTimeRange } from "@/lib/format";
import { stripHtmlToPlainLine } from "@/lib/strip-html";
import { useDossierJobs } from "@/providers/DossierJobsProvider";
import { usePreferences, useTranslation } from "@/providers/PreferencesProvider";
import type { TranslationKey } from "@/i18n/types";

type MeetingRow = OutlookReunionApi & { provider: CalendarProvider };

type ProviderFilter = "all" | CalendarProvider;

type PreviewState = {
  eventKey: string;
  tema: string;
  corporate: string | null;
  person: string | null;
  savedCorporate?: CalendarSavedDossierRef;
  savedPerson?: CalendarSavedDossierRef;
  savedFolder?: { id: string; title: string };
  lushaWarnings?: string[];
  corporateSkippedFreePlan?: boolean;
};

type Props = {
  /** Muestra chips de conexión (página de automatización). */
  showProviderConnections?: boolean;
  top?: number;
};

function providerMeta(provider: CalendarProvider) {
  return provider === "google"
    ? { color: "#4285f4", bg: "rgba(66,133,244,0.12)", labelKey: "overview.google_title" as const }
    : { color: "#0078d4", bg: "rgba(0,120,212,0.12)", labelKey: "overview.microsoft_title" as const };
}

function meetingDescriptionText(descripcion: string | undefined): string {
  return stripHtmlToPlainLine(descripcion, 8000) || (descripcion || "").trim();
}

function descriptionHasPersonHint(descripcion: string): boolean {
  return /(?:contacto|contact|nombre|name|nome|nom|contatto|kontakt)\s*:/i.test(descripcion);
}

function meetingRowKey(m: MeetingRow): string {
  return `${m.provider}-${m.id || `${m.inicio}-${m.tema}`}`;
}

export default function CalendarMeetingsList({
  showProviderConnections = false,
  top = 20,
}: Props) {
  const { t } = useTranslation();
  const { preferences, effectiveTimezone } = usePreferences();
  const { enqueueCalendarJob, isEventGenerating, getJobForEvent } = useDossierJobs();

  const [googleConnected, setGoogleConnected] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [load, setLoad] = useState<"idle" | "loading" | "ready">("idle");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<CalendarProvider | null>(null);
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [diagnoseJson, setDiagnoseJson] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const timePrefs = useMemo(
    () => ({ locale: preferences.locale, timezone: effectiveTimezone }),
    [preferences.locale, effectiveTimezone],
  );

  const loadMeetings = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setGoogleConnected(false);
      setOutlookConnected(false);
      setMeetings([]);
      setLoad("idle");
      return;
    }
    setLoad("loading");
    setErr(null);
    setDiagnoseJson(null);
    const merged: MeetingRow[] = [];
    let gOk = false;
    let oOk = false;

    try {
      const g = await fetchGoogleCalendarEventos({ top, incluir_pasadas: false });
      gOk = true;
      merged.push(...g.reuniones.map((r) => ({ ...r, provider: "google" as const })));
    } catch (e) {
      if (!(e instanceof DossierApiError && e.status === 404)) {
        setErr(e instanceof DossierApiError ? e.message : t("automation.calendar_load_error"));
      }
    }

    try {
      const o = await fetchOutlookCalendarEventos({ top, incluir_pasadas: false });
      oOk = true;
      merged.push(...o.reuniones.map((r) => ({ ...r, provider: "microsoft" as const })));
    } catch (e) {
      if (!(e instanceof DossierApiError && e.status === 404)) {
        setErr((prev) => prev || (e instanceof DossierApiError ? e.message : t("automation.calendar_load_error")));
      }
    }

    merged.sort((a, b) => Date.parse(a.inicio ?? "") - Date.parse(b.inicio ?? ""));
    setGoogleConnected(gOk);
    setOutlookConnected(oOk);
    setMeetings(merged);
    setLoad("ready");
  }, [t, top]);

  useEffect(() => {
    queueMicrotask(() => void loadMeetings());
  }, [loadMeetings]);

  useEffect(() => {
    for (const r of meetings) {
      const id = r.id?.trim();
      if (!id) continue;
      const job = getJobForEvent(id);
      if (job?.job_type !== "calendar_manual" || job.status !== "completed" || !job.result) {
        continue;
      }
      const first = job.result as CalendarGenerarDossierItem;
      const corporate = first.dossier_corporativo ?? null;
      const person = first.dossier_persona ?? null;
      const research = first.dossier_persona_research as { warnings?: string[] } | undefined;
      const lushaWarnings = Array.isArray(research?.warnings)
        ? research.warnings.filter((w): w is string => typeof w === "string" && w.trim().length > 0)
        : undefined;
      if (!corporate?.trim() && !person?.trim() && !first.dossier_generado?.trim()) continue;
      setPreview({
        eventKey: id,
        tema: first.reunion?.tema || r.tema || "—",
        corporate,
        person,
        lushaWarnings,
        savedCorporate: first.saved_dossiers?.corporate,
        savedPerson: first.saved_dossiers?.person,
        savedFolder: first.saved_dossiers?.folder,
        corporateSkippedFreePlan: first.corporate_skipped_plan_free === true,
      });
    }
  }, [meetings, getJobForEvent]);

  async function connect(provider: CalendarProvider) {
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

  async function onGenerateDossier(r: MeetingRow) {
    const id = r.id?.trim();
    if (!id) {
      setGenErr(t(r.provider === "google" ? "overview.google_no_event_id" : "overview.microsoft_no_event_id"));
      return;
    }
    if (isEventGenerating(id)) return;
    setGenErr(null);
    try {
      await enqueueCalendarJob(r.provider, { eventId: id, reunion: r });
    } catch (e) {
      setGenErr(
        e instanceof DossierApiError
          ? e.message
          : t(r.provider === "google" ? "overview.google_generate_error" : "overview.microsoft_generate_error"),
      );
    }
  }

  async function onDiagnose(provider: CalendarProvider) {
    setDiagnoseLoading(true);
    setDiagnoseJson(null);
    try {
      const data = await fetchCalendarDiagnostico(provider);
      setDiagnoseJson(JSON.stringify(data, null, 2));
    } catch (e) {
      setDiagnoseJson(
        e instanceof DossierApiError ? e.message : t("overview.calendar_diagnose_error"),
      );
    } finally {
      setDiagnoseLoading(false);
    }
  }

  const anyConnected = googleConnected || outlookConnected;
  const token = typeof window !== "undefined" ? getStoredAccessToken() : null;
  const allDayLabel = t("overview.calendar_all_day");

  const filteredMeetings = useMemo(() => {
    if (providerFilter === "all") return meetings;
    return meetings.filter((m) => m.provider === providerFilter);
  }, [meetings, providerFilter]);

  const groupedByDay = useMemo(() => {
    const map = new Map<string, { dayLabel: string; items: MeetingRow[] }>();
    for (const m of filteredMeetings) {
      const when = formatMeetingTimeRange(m.inicio, m.fin, timePrefs, {
        allDay: m.todo_el_dia,
        allDayLabel,
      });
      const bucket = map.get(when.dayKey);
      if (bucket) {
        bucket.items.push(m);
      } else {
        map.set(when.dayKey, { dayLabel: when.dayLabel, items: [m] });
      }
    }
    return [...map.entries()];
  }, [filteredMeetings, timePrefs, allDayLabel]);

  const filterButtons: { id: ProviderFilter; labelKey: TranslationKey }[] = [
    { id: "all", labelKey: "overview.calendar_filter_all" },
    { id: "microsoft", labelKey: "overview.calendar_filter_outlook" },
    { id: "google", labelKey: "overview.calendar_filter_google" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {showProviderConnections ? (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
            style={{
              borderColor: googleConnected ? "rgba(66,133,244,0.45)" : "var(--border-default)",
              color: googleConnected ? "#4285f4" : "var(--text-muted)",
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#4285f4" }} />
            {t("overview.google_title")} {googleConnected ? "✓" : "—"}
          </span>
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
            style={{
              borderColor: outlookConnected ? "rgba(0,120,212,0.45)" : "var(--border-default)",
              color: outlookConnected ? "#0078d4" : "var(--text-muted)",
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#0078d4" }} />
            {t("overview.microsoft_title")} {outlookConnected ? "✓" : "—"}
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
              loading={connecting === "microsoft"}
              onClick={() => void connect("microsoft")}
            >
              {t("overview.microsoft_connect")}
            </PrimaryButton>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {filterButtons.map((btn) => {
            const active = providerFilter === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setProviderFilter(btn.id)}
                className="rounded-full border px-3 py-1 text-xs font-medium transition"
                style={{
                  borderColor: active ? "var(--accent-from)" : "var(--border-default)",
                  backgroundColor: active ? "rgba(0, 180, 216, 0.1)" : "var(--bg-surface)",
                  color: active ? "var(--accent-from)" : "var(--text-muted)",
                }}
              >
                {t(btn.labelKey)}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={!token || load === "loading"}
          onClick={() => void loadMeetings()}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-primary)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          {load === "loading" ? t("overview.microsoft_loading") : t("overview.calendar_refresh")}
        </button>
      </div>

      {err ? (
        <UiAlert variant="warning" role="alert">
          {err}
        </UiAlert>
      ) : null}
      {genErr ? (
        <UiAlert variant="error" role="alert">
          {genErr}
        </UiAlert>
      ) : null}

      {!token ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("overview.activity_login_hint")}
        </p>
      ) : load === "loading" ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("overview.microsoft_loading")}
        </p>
      ) : load === "ready" && !anyConnected ? (
        <div
          className="rounded-xl border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
        >
          {t("automation.calendars_empty")}
        </div>
      ) : load === "ready" && anyConnected && filteredMeetings.length === 0 ? (
        <div
          className="rounded-xl border px-4 py-6 text-center text-sm"
          style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
        >
          {t("automation.no_upcoming_events")}
          <div className="mt-3">
            <button
              type="button"
              disabled={diagnoseLoading}
              onClick={() => void onDiagnose(outlookConnected ? "microsoft" : "google")}
              className="text-xs font-medium underline-offset-2 hover:underline disabled:opacity-50"
              style={{ color: "var(--accent-from)" }}
            >
              {diagnoseLoading ? t("overview.calendar_diagnose_loading") : t("overview.calendar_diagnose")}
            </button>
          </div>
          {diagnoseJson ? (
            <pre
              className="mx-auto mt-3 max-h-40 max-w-lg overflow-auto rounded-lg border p-2 text-left text-[11px]"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-muted)",
              }}
            >
              {diagnoseJson}
            </pre>
          ) : null}
        </div>
      ) : null}

      {filteredMeetings.length > 0 ? (
        <div className="flex flex-col gap-5">
          <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {t("overview.calendar_meetings_heading")}
            <span className="ml-2 font-normal" style={{ color: "var(--text-muted)" }}>
              ({filteredMeetings.length})
            </span>
          </h4>

          {groupedByDay.map(([dayKey, { dayLabel, items }]) => (
            <div key={dayKey}>
              <p
                className="mb-2 text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-subtle)" }}
              >
                {dayLabel}
              </p>
              <ul className="flex flex-col gap-2">
                {items.map((m) => {
                  const rowKey = meetingRowKey(m);
                  const expanded = expandedKey === rowKey;
                  const when = formatMeetingTimeRange(m.inicio, m.fin, timePrefs, {
                    allDay: m.todo_el_dia,
                    allDayLabel,
                  });
                  const meta = providerMeta(m.provider);
                  const descripcion = meetingDescriptionText(m.descripcion);
                  const hasContacto = descriptionHasPersonHint(descripcion);
                  const whenLabel =
                    m.provider === "google" ? t("overview.google_when") : t("overview.microsoft_when");
                  const participantsLabel =
                    m.provider === "google"
                      ? t("overview.google_participants")
                      : t("overview.microsoft_participants");
                  const generateLabel =
                    m.provider === "google"
                      ? t("overview.google_generate_dossier")
                      : t("overview.microsoft_generate_dossier");
                  const generatingLabel =
                    m.provider === "google"
                      ? t("overview.google_generating")
                      : t("overview.microsoft_generating");

                  return (
                    <li
                      key={rowKey}
                      className="overflow-hidden rounded-xl border transition"
                      style={{
                        borderColor: expanded ? meta.color : "var(--border-default)",
                        backgroundColor: "var(--bg-surface)",
                        opacity: when.isPast ? 0.82 : 1,
                      }}
                    >
                      <button
                        type="button"
                        className="flex w-full gap-3 px-3 py-3 text-left"
                        aria-expanded={expanded}
                        onClick={() => setExpandedKey(expanded ? null : rowKey)}
                      >
                        <div
                          className="mt-1 w-1 shrink-0 self-stretch rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className="truncate text-sm font-medium"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {m.tema || "—"}
                            </p>
                            {when.isPast ? (
                              <span
                                className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                                style={{
                                  color: "var(--text-muted)",
                                  backgroundColor: "var(--bg-surface-strong)",
                                }}
                              >
                                {t("overview.calendar_past_badge")}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                            {when.timeLabel}
                            {m.ubicacion ? ` · ${m.ubicacion}` : ""}
                          </p>
                        </div>
                        <span
                          className="hidden shrink-0 self-center rounded-md px-2 py-1 text-[10px] font-semibold sm:inline"
                          style={{ color: meta.color, backgroundColor: meta.bg }}
                        >
                          {t(meta.labelKey)}
                        </span>
                        <svg
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className={`shrink-0 self-center transition-transform ${expanded ? "rotate-180" : ""}`}
                          style={{ color: "var(--text-subtle)" }}
                          aria-hidden
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {expanded ? (
                        <div
                          className="border-t px-4 pb-4 pt-3 text-sm"
                          style={{ borderColor: "var(--border-subtle)" }}
                        >
                          <div className="mb-3 flex flex-wrap items-center gap-2 sm:hidden">
                            <span
                              className="rounded-md px-2 py-1 text-[10px] font-semibold"
                              style={{ color: meta.color, backgroundColor: meta.bg }}
                            >
                              {t(meta.labelKey)}
                            </span>
                          </div>

                          <div className="space-y-2 text-xs" style={{ color: "var(--text-muted)" }}>
                            <p>
                              <span className="font-semibold">{whenLabel}:</span> {when.fullLabel}
                            </p>
                            {m.participantes ? (
                              <p>
                                <span className="font-semibold">{participantsLabel}:</span>{" "}
                                {m.participantes}
                              </p>
                            ) : null}
                            {m.ubicacion ? (
                              <p>
                                <span className="font-semibold">{t("overview.calendar_location")}:</span>{" "}
                                {m.ubicacion}
                              </p>
                            ) : null}
                          </div>

                          <div className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                            <span className="font-semibold">{t("overview.calendar_description")}:</span>
                            {descripcion ? (
                              <pre
                                className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border px-2.5 py-2 font-sans text-xs leading-relaxed"
                                style={{
                                  borderColor: hasContacto
                                    ? "rgba(52,211,153,0.25)"
                                    : "var(--border-default)",
                                  backgroundColor: "var(--bg-input)",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {descripcion}
                              </pre>
                            ) : (
                              <div className="mt-1">
                                <p className="ui-alert ui-alert-warning px-2.5 py-2 text-xs">
                                  {t("overview.calendar_description_empty")}
                                </p>
                                <CalendarMeetingFormatGuide variant="inline" defaultOpen />
                              </div>
                            )}
                            {descripcion && !hasContacto ? (
                              <div className="mt-1">
                                <p className="ui-text-warning text-xs">
                                  {t("overview.calendar_description_no_contact")}
                                </p>
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={!m.id || isEventGenerating(m.id)}
                              onClick={() => void onGenerateDossier(m)}
                              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                              style={{
                                backgroundImage:
                                  "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
                              }}
                            >
                              {isEventGenerating(m.id) ? generatingLabel : generateLabel}
                            </button>
                          </div>

                          {preview && m.id ? (
                            <CalendarDossierPreview
                              eventKey={m.id}
                              activeEventKey={preview.eventKey}
                              tema={preview.tema}
                              corporate={preview.corporate}
                              person={preview.person}
                              lushaWarnings={preview.lushaWarnings}
                              savedCorporate={preview.savedCorporate}
                              savedPerson={preview.savedPerson}
                              savedFolder={preview.savedFolder}
                              corporateSkippedFreePlan={preview.corporateSkippedFreePlan}
                            />
                          ) : null}
                        </div>
                      ) : null}
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
