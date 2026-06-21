"use client";

import { useCallback, useEffect, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import {
  DossierApiError,
  fetchGenerarDossiersDesdeGoogleCalendar,
  fetchGoogleCalendarEventos,
  fetchGoogleIntegrationStartAsJson,
  getStoredAccessToken,
  type OutlookReunionApi,
  type CalendarSavedDossierRef,
} from "@/lib/dossier-api";
import CalendarDossierPreview from "@/components/dashboard/CalendarDossierPreview";
import { useTranslation } from "@/providers/PreferencesProvider";
import type { Locale } from "@/i18n/types";

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

export default function GoogleCalendarPanel() {
  const { t, locale } = useTranslation();
  const bcp47 = localeToBcp47(locale);

  const [rows, setRows] = useState<OutlookReunionApi[]>([]);
  const [apiHint, setApiHint] = useState<string | null>(null);
  const [load, setLoad] = useState<"idle" | "loading" | "ready">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [includePast, setIncludePast] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    eventKey: string;
    tema: string;
    corporate: string | null;
    person: string | null;
    savedCorporate?: CalendarSavedDossierRef;
    savedPerson?: CalendarSavedDossierRef;
    savedFolder?: { id: string; title: string };
  } | null>(null);

  const loadMeetings = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setRows([]);
      setApiHint(null);
      setErr(null);
      setLoad("idle");
      return;
    }
    setLoad("loading");
    setErr(null);
    try {
      const data = await fetchGoogleCalendarEventos({
        top: 15,
        incluir_pasadas: includePast,
      });
      setRows(data.reuniones);
      setApiHint(data.mensaje);
      setLoad("ready");
    } catch (e) {
      setRows([]);
      setApiHint(null);
      if (e instanceof DossierApiError && e.status === 404) {
        setErr(t("overview.google_no_connection"));
      } else if (e instanceof DossierApiError) {
        setErr(e.message || t("overview.google_error"));
      } else {
        setErr(t("overview.google_error"));
      }
      setLoad("ready");
    }
  }, [t, includePast]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadMeetings();
    });
  }, [loadMeetings]);

  async function onConnectGoogle() {
    setConnecting(true);
    setErr(null);
    try {
      const { authorize_url } = await fetchGoogleIntegrationStartAsJson();
      window.location.href = authorize_url;
    } catch (e) {
      setConnecting(false);
      if (e instanceof DossierApiError) setErr(e.message);
      else setErr(t("overview.google_error"));
    }
  }

  async function onGenerateDossier(r: OutlookReunionApi) {
    const id = r.id?.trim();
    if (!id) {
      setGenErr(t("overview.google_no_event_id"));
      return;
    }
    setGenErr(null);
    setGeneratingId(id);
    try {
      const data = await fetchGenerarDossiersDesdeGoogleCalendar({ eventId: id });
      const first = data.dossiers[0];
      const corporate = first?.dossier_corporativo ?? null;
      const person = first?.dossier_persona ?? null;
      if (!first || (!corporate?.trim() && !person?.trim() && !first.dossier_generado?.trim())) {
        setGenErr(t("overview.google_generate_empty"));
        return;
      }
      setPreview({
        eventKey: id,
        tema: first.reunion?.tema || r.tema || "—",
        corporate,
        person,
        savedCorporate: first.saved_dossiers?.corporate,
        savedPerson: first.saved_dossiers?.person,
        savedFolder: first.saved_dossiers?.folder,
      });
    } catch (e) {
      if (e instanceof DossierApiError) setGenErr(e.message || t("overview.google_generate_error"));
      else setGenErr(t("overview.google_generate_error"));
    } finally {
      setGeneratingId(null);
    }
  }

  const token = typeof window !== "undefined" ? getStoredAccessToken() : null;

  return (
    <div className="flex flex-col gap-4 px-1 py-1">
      <p className="text-xs leading-relaxed sm:text-sm" style={{ color: "var(--text-muted)" }}>
        {t("overview.google_subtitle")}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <PrimaryButton
          type="button"
          className="w-full sm:w-auto sm:min-w-[200px]"
          loading={connecting}
          disabled={!token}
          onClick={() => void onConnectGoogle()}
        >
          {t("overview.google_connect")}
        </PrimaryButton>
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
          {load === "loading" ? t("overview.google_loading") : t("overview.google_refresh")}
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
          {t("overview.google_include_past")}
        </label>
      </div>

      {err && (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
          role="alert"
        >
          {err}
        </div>
      )}

      {genErr && (
        <div
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100"
          role="alert"
        >
          {genErr}
        </div>
      )}

      {!token ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("overview.activity_login_hint")}
        </p>
      ) : load === "loading" ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("overview.google_loading")}
        </p>
      ) : rows.length === 0 && !err ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {apiHint || t("overview.google_events_empty")}
        </p>
      ) : rows.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
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
                <span className="font-semibold">{t("overview.google_when")}:</span>{" "}
                {formatMeetingWhen(r.inicio || "", r.fin || "", bcp47)}
              </div>
              {r.participantes ? (
                <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span className="font-semibold">{t("overview.google_participants")}:</span>{" "}
                  {r.participantes}
                </div>
              ) : null}
              {r.ubicacion ? (
                <div className="mt-1 text-xs" style={{ color: "var(--text-subtle)" }}>
                  {r.ubicacion}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!r.id || generatingId !== null}
                  onClick={() => void onGenerateDossier(r)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
                  }}
                >
                  {generatingId === r.id ? t("overview.google_generating") : t("overview.google_generate_dossier")}
                </button>
              </div>
              {preview ? (
                <CalendarDossierPreview
                  eventKey={r.id || ""}
                  activeEventKey={preview.eventKey}
                  tema={preview.tema}
                  corporate={preview.corporate}
                  person={preview.person}
                  savedCorporate={preview.savedCorporate}
                  savedPerson={preview.savedPerson}
                  savedFolder={preview.savedFolder}
                />
              ) : null}
            </li>
          ))}
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
