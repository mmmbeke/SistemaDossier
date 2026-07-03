"use client";

import { useCallback, useEffect, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
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
import CalendarDossierPreview from "@/components/dashboard/CalendarDossierPreview";
import CalendarMeetingFormatGuide from "@/components/dashboard/CalendarMeetingFormatGuide";
import { descriptionHasPersonHint } from "@/lib/calendar-meeting-format";
import UiAlert from "@/components/ui/UiAlert";
import { useDossierJobs } from "@/providers/DossierJobsProvider";
import { useTranslation } from "@/providers/PreferencesProvider";
import type { Locale } from "@/i18n/types";
import type { TranslationKey } from "@/i18n/types";

type Props = {
  provider: CalendarProvider;
};

const I18N: Record<
  CalendarProvider,
  {
    subtitle: TranslationKey;
    connect: TranslationKey;
    connected: TranslationKey;
    refresh: TranslationKey;
    loading: TranslationKey;
    error: TranslationKey;
    noConnection: TranslationKey;
    eventsEmpty: TranslationKey;
    when: TranslationKey;
    participants: TranslationKey;
    includePast: TranslationKey;
    generateDossier: TranslationKey;
    generating: TranslationKey;
    generateError: TranslationKey;
    generateEmpty: TranslationKey;
    noEventId: TranslationKey;
  }
> = {
  google: {
    subtitle: "overview.google_subtitle",
    connect: "overview.google_connect",
    connected: "overview.google_connected",
    refresh: "overview.google_refresh",
    loading: "overview.google_loading",
    error: "overview.google_error",
    noConnection: "overview.google_no_connection",
    eventsEmpty: "overview.google_events_empty",
    when: "overview.google_when",
    participants: "overview.google_participants",
    includePast: "overview.google_include_past",
    generateDossier: "overview.google_generate_dossier",
    generating: "overview.google_generating",
    generateError: "overview.google_generate_error",
    generateEmpty: "overview.google_generate_empty",
    noEventId: "overview.google_no_event_id",
  },
  microsoft: {
    subtitle: "overview.microsoft_subtitle",
    connect: "overview.microsoft_connect",
    connected: "overview.microsoft_connected",
    refresh: "overview.microsoft_refresh",
    loading: "overview.microsoft_loading",
    error: "overview.microsoft_error",
    noConnection: "overview.microsoft_no_connection",
    eventsEmpty: "overview.microsoft_events_empty",
    when: "overview.microsoft_when",
    participants: "overview.microsoft_participants",
    includePast: "overview.microsoft_include_past",
    generateDossier: "overview.microsoft_generate_dossier",
    generating: "overview.microsoft_generating",
    generateError: "overview.microsoft_generate_error",
    generateEmpty: "overview.microsoft_generate_empty",
    noEventId: "overview.microsoft_no_event_id",
  },
};

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

function meetingDescriptionText(descripcion: string | undefined): string {
  return (descripcion || "").trim();
}

function formatMeetingWhen(inicio: string, fin: string, bcp47: string): string {
  const si = Date.parse(inicio);
  if (Number.isNaN(si)) return (inicio || "—").slice(0, 40);
  const d0 = new Date(si);
  const fi = Date.parse(fin);
  const d1 = Number.isNaN(fi) ? null : new Date(fi);
  const dateTimeOpts: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  };
  const timeOpts: Intl.DateTimeFormatOptions = { timeStyle: "short" };
  try {
    const startStr = d0.toLocaleString(bcp47, dateTimeOpts);
    if (!d1) return startStr;
    return `${startStr} – ${d1.toLocaleTimeString(bcp47, timeOpts)}`;
  } catch {
    return d0.toISOString();
  }
}

export default function CalendarIntegrationPanel({ provider }: Props) {
  const { t, locale } = useTranslation();
  const keys = I18N[provider];
  const bcp47 = localeToBcp47(locale);

  const [rows, setRows] = useState<OutlookReunionApi[]>([]);
  const [apiHint, setApiHint] = useState<string | null>(null);
  const [load, setLoad] = useState<"idle" | "loading" | "ready">("idle");
  const [connected, setConnected] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [includePast, setIncludePast] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const { enqueueCalendarJob, isEventGenerating, getJobForEvent } = useDossierJobs();
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [diagnoseJson, setDiagnoseJson] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    eventKey: string;
    tema: string;
    corporate: string | null;
    person: string | null;
    persons?: Array<{ name: string; body: string | null; saved?: CalendarSavedDossierRef }>;
    savedCorporate?: CalendarSavedDossierRef;
    savedPerson?: CalendarSavedDossierRef;
    savedFolder?: { id: string; title: string };
    lushaWarnings?: string[];
  } | null>(null);

  const loadMeetings = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setRows([]);
      setApiHint(null);
      setErr(null);
      setConnected(false);
      setLoad("idle");
      return;
    }
    setLoad("loading");
    setErr(null);
    setDiagnoseJson(null);
    try {
      const data =
        provider === "google"
          ? await fetchGoogleCalendarEventos({ top: 15, incluir_pasadas: includePast })
          : await fetchOutlookCalendarEventos({ top: 15, incluir_pasadas: includePast });
      setRows(data.reuniones);
      setApiHint(data.mensaje);
      setConnected(true);
      setLoad("ready");
    } catch (e) {
      setRows([]);
      setApiHint(null);
      setConnected(false);
      if (e instanceof DossierApiError && e.status === 404) {
        setErr(t(keys.noConnection));
      } else if (e instanceof DossierApiError) {
        setErr(e.message || t(keys.error));
      } else {
        setErr(t(keys.error));
      }
      setLoad("ready");
    }
  }, [t, keys, provider, includePast]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadMeetings();
    });
  }, [loadMeetings]);

  async function onConnect() {
    setConnecting(true);
    setErr(null);
    try {
      const { authorize_url } =
        provider === "google"
          ? await fetchGoogleIntegrationStartAsJson()
          : await fetchMicrosoftIntegrationStartAsJson();
      window.location.href = authorize_url;
    } catch (e) {
      setConnecting(false);
      if (e instanceof DossierApiError) setErr(e.message);
      else setErr(t(keys.error));
    }
  }

  async function onGenerateDossier(r: OutlookReunionApi) {
    const id = r.id?.trim();
    if (!id) {
      setGenErr(t(keys.noEventId));
      return;
    }
    if (isEventGenerating(id)) return;
    setGenErr(null);
    try {
      await enqueueCalendarJob(provider, { eventId: id, reunion: r });
    } catch (e) {
      if (e instanceof DossierApiError) setGenErr(e.message || t(keys.generateError));
      else setGenErr(t(keys.generateError));
    }
  }

  useEffect(() => {
    for (const r of rows) {
      const id = r.id?.trim();
      if (!id) continue;
      const job = getJobForEvent(id);
      if (job?.job_type !== "calendar_manual" || job.status !== "completed" || !job.result) {
        continue;
      }
      const first = job.result as CalendarGenerarDossierItem;
      const corporate = first.dossier_corporativo ?? null;
      const person = first.dossier_persona ?? null;
      const dossierPersonas = first.dossier_personas ?? [];
      const savedPersons = first.saved_dossiers?.persons ?? [];
      const persons =
        dossierPersonas.length > 0
          ? dossierPersonas.map((p, i) => ({
              name: p.full_name?.trim() || `Contacto ${p.index ?? i + 1}`,
              body: p.md ?? null,
              saved: savedPersons[i],
            }))
          : undefined;
      const research = first.dossier_persona_research as
        | { warnings?: string[] }
        | undefined;
      const lushaWarnings = Array.isArray(research?.warnings)
        ? research!.warnings!.filter((w): w is string => typeof w === "string" && w.trim().length > 0)
        : undefined;
      const hasPersonPreview = Boolean(person?.trim()) || (persons?.some((p) => p.body?.trim()) ?? false);
      if (!corporate?.trim() && !hasPersonPreview && !first.dossier_generado?.trim()) continue;
      setPreview({
        eventKey: id,
        tema: first.reunion?.tema || r.tema || "—",
        corporate,
        person,
        persons,
        lushaWarnings,
        savedCorporate: first.saved_dossiers?.corporate,
        savedPerson: first.saved_dossiers?.person,
        savedFolder: first.saved_dossiers?.folder,
      });
    }
  }, [rows, getJobForEvent]);

  async function onDiagnose() {
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

  const token = typeof window !== "undefined" ? getStoredAccessToken() : null;
  const providerAccent = provider === "google" ? "#4285f4" : "#0078d4";
  const providerAccentBorder =
    provider === "google" ? "rgba(66,133,244,0.45)" : "rgba(0,120,212,0.45)";

  return (
    <div className="flex flex-col gap-4 px-1 py-1">
      <p className="text-xs leading-relaxed sm:text-sm" style={{ color: "var(--text-muted)" }}>
        {t(keys.subtitle)}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {connected ? (
          <span
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold sm:w-auto sm:min-w-[200px]"
            style={{
              borderColor: providerAccentBorder,
              color: providerAccent,
              backgroundColor: "var(--bg-surface)",
            }}
          >
            <span aria-hidden className="text-base leading-none">
              ✓
            </span>
            {t(keys.connected)}
          </span>
        ) : (
          <PrimaryButton
            type="button"
            className="w-full sm:w-auto sm:min-w-[200px]"
            loading={connecting}
            disabled={!token || load === "loading"}
            onClick={() => void onConnect()}
          >
            {t(keys.connect)}
          </PrimaryButton>
        )}
        <button
          type="button"
          disabled={!token || load === "loading"}
          onClick={() => void loadMeetings()}
          className="rounded-lg border px-4 py-2.5 text-sm font-medium transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-primary)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          {load === "loading" ? t(keys.loading) : t(keys.refresh)}
        </button>
        <label
          className="flex cursor-pointer items-center gap-2 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          <input
            type="checkbox"
            className="rounded border"
            style={{ borderColor: "var(--border-default)" }}
            checked={includePast}
            onChange={(e) => setIncludePast(e.target.checked)}
          />
          {t(keys.includePast)}
        </label>
      </div>

      {err && (
        <UiAlert variant="warning" role="alert">
          {err}
        </UiAlert>
      )}

      {genErr && (
        <UiAlert variant="error" role="alert">
          {genErr}
        </UiAlert>
      )}

      {!token ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("overview.activity_login_hint")}
        </p>
      ) : load === "loading" ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t(keys.loading)}
        </p>
      ) : rows.length === 0 && !err ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {apiHint || t(keys.eventsEmpty)}
          </p>
          {connected ? (
            <button
              type="button"
              disabled={diagnoseLoading}
              onClick={() => void onDiagnose()}
              className="self-start text-xs font-medium underline-offset-2 hover:underline disabled:opacity-50"
              style={{ color: "var(--accent-from)" }}
            >
              {diagnoseLoading ? t("overview.calendar_diagnose_loading") : t("overview.calendar_diagnose")}
            </button>
          ) : null}
          {diagnoseJson ? (
            <pre
              className="max-h-48 overflow-auto rounded-lg border p-2 text-[11px]"
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
      ) : rows.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const descripcion = meetingDescriptionText(r.descripcion);
            const hasContacto = descriptionHasPersonHint(descripcion);
            return (
            <li
              key={r.id || `${r.inicio}-${r.tema}`}
              className="rounded-lg border px-3 py-3 text-sm"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                {r.tema || "—"}
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                <span className="font-semibold">{t(keys.when)}:</span>{" "}
                {formatMeetingWhen(r.inicio || "", r.fin || "", bcp47)}
              </div>
              {r.participantes ? (
                <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span className="font-semibold">{t(keys.participants)}:</span>{" "}
                  {r.participantes}
                </div>
              ) : null}
              {r.ubicacion ? (
                <div className="mt-1 text-xs" style={{ color: "var(--text-subtle)" }}>
                  {r.ubicacion}
                </div>
              ) : null}
              <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <span className="font-semibold">{t("overview.calendar_description")}:</span>
                {descripcion ? (
                  <pre
                    className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border px-2.5 py-2 font-sans text-xs leading-relaxed"
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
                    <CalendarMeetingFormatGuide variant="inline" defaultOpen />
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!r.id || isEventGenerating(r.id)}
                  onClick={() => void onGenerateDossier(r)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
                  }}
                >
                  {isEventGenerating(r.id) ? t(keys.generating) : t(keys.generateDossier)}
                </button>
              </div>
              {preview ? (
                <CalendarDossierPreview
                  eventKey={r.id || ""}
                  activeEventKey={preview.eventKey}
                  tema={preview.tema}
                  corporate={preview.corporate}
                  person={preview.person}
                  persons={preview.persons}
                  lushaWarnings={preview.lushaWarnings}
                  savedCorporate={preview.savedCorporate}
                  savedPerson={preview.savedPerson}
                  savedFolder={preview.savedFolder}
                />
              ) : null}
            </li>
            );
          })}
        </ul>
      )}

      {load === "ready" && rows.length > 0 && apiHint ? (
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
          {apiHint}
        </p>
      ) : null}
    </div>
  );
}
