"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import {
  disconnectCalendarIntegration,
  DossierApiError,
  fetchGoogleCalendarEventos,
  fetchGoogleIntegrationStartAsJson,
  fetchMicrosoftIntegrationStartAsJson,
  fetchOutlookCalendarEventos,
  getStoredAccessToken,
  type CalendarProvider,
} from "@/lib/dossier-api";
import UiAlert from "@/components/ui/UiAlert";
import { useTranslation } from "@/providers/PreferencesProvider";
import type { TranslationKey } from "@/i18n/types";

type Props = {
  provider: CalendarProvider;
  embedded?: boolean;
};

const I18N: Record<
  CalendarProvider,
  {
    connect: TranslationKey;
    connected: TranslationKey;
    loading: TranslationKey;
    error: TranslationKey;
    noConnection: TranslationKey;
    connectedHint: TranslationKey;
  }
> = {
  google: {
    connect: "overview.google_connect",
    connected: "overview.google_connected",
    loading: "overview.google_loading",
    error: "overview.google_error",
    noConnection: "overview.google_no_connection",
    connectedHint: "overview.google_connected_hint",
  },
  microsoft: {
    connect: "overview.microsoft_connect",
    connected: "overview.microsoft_connected",
    loading: "overview.microsoft_loading",
    error: "overview.microsoft_error",
    noConnection: "overview.microsoft_no_connection",
    connectedHint: "overview.microsoft_connected_hint",
  },
};

export default function CalendarIntegrationPanel({ provider, embedded = false }: Props) {
  const { t } = useTranslation();
  const keys = I18N[provider];

  const [load, setLoad] = useState<"idle" | "loading" | "ready">("idle");
  const [connected, setConnected] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const checkConnection = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setErr(null);
      setConnected(false);
      setLoad("idle");
      return;
    }
    setLoad("loading");
    setErr(null);
    try {
      const fetchEvents =
        provider === "google" ? fetchGoogleCalendarEventos : fetchOutlookCalendarEventos;
      await fetchEvents({ top: 1, incluir_pasadas: false });
      setConnected(true);
      setLoad("ready");
    } catch (e) {
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
  }, [t, keys, provider]);

  useEffect(() => {
    queueMicrotask(() => {
      void checkConnection();
    });
  }, [checkConnection]);

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

  async function onDisconnect() {
    setDisconnecting(true);
    setErr(null);
    try {
      await disconnectCalendarIntegration(provider);
      setConnected(false);
      setLoad("ready");
      setErr(t(keys.noConnection));
    } catch (e) {
      if (e instanceof DossierApiError) {
        const msg = e.message === "Not Found"
          ? t("overview.calendar_disconnect_server")
          : e.message;
        setErr(msg);
      } else {
        setErr(t(keys.error));
      }
    } finally {
      setDisconnecting(false);
    }
  }

  const token = typeof window !== "undefined" ? getStoredAccessToken() : null;
  const providerAccent = provider === "google" ? "#4285f4" : "#0078d4";
  const providerAccentBorder =
    provider === "google" ? "rgba(66,133,244,0.45)" : "rgba(0,120,212,0.45)";

  return (
    <div className={embedded ? "flex flex-col gap-3" : "flex flex-col gap-4 px-1 py-1"}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {connected ? (
          <>
            <span
              className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold sm:text-sm ${
                embedded ? "w-full sm:flex-1" : "w-full sm:w-auto sm:min-w-[200px]"
              }`}
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
            <button
              type="button"
              onClick={() => void onDisconnect()}
              disabled={disconnecting}
              className={`ui-calendar-disconnect-btn gap-2 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm ${
                embedded ? "w-full sm:w-auto" : "w-full sm:w-auto"
              }`}
            >
              {disconnecting ? t("overview.calendar_disconnecting") : t("overview.calendar_disconnect")}
            </button>
          </>
        ) : (
          <PrimaryButton
            type="button"
            className={`ui-calendar-connect-btn ${embedded ? "w-full sm:flex-1" : "w-full sm:w-auto sm:min-w-[200px]"}`}
            loading={connecting}
            disabled={!token || load === "loading"}
            onClick={() => void onConnect()}
          >
            {t(keys.connect)}
          </PrimaryButton>
        )}
      </div>

      {err ? (
        <UiAlert variant="warning" role="alert">
          {err}
        </UiAlert>
      ) : null}

      {!token ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("overview.activity_login_hint")}
        </p>
      ) : connected && load === "ready" ? (
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {t(keys.connectedHint)}{" "}
          <Link
            href="/dashboard/dossiers"
            className="font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--accent-from)" }}
          >
            {t("nav.dossiers")}
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
