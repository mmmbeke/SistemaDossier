"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import UiAlert from "@/components/ui/UiAlert";
import GoogleCalendarPanel from "@/components/dashboard/GoogleCalendarPanel";
import MicrosoftOutlookPanel from "@/components/dashboard/MicrosoftOutlookPanel";
import StatCard from "@/components/dashboard/StatCard";
import TopBar from "@/components/dashboard/TopBar";
import {
  DossierApiError,
  fetchAuthMe,
  fetchDossiersFromApi,
  getStoredAccessToken,
  readDossierUserPreview,
  type AuthUser,
  type DossierListEntry,
  isDossierFolderEntry,
} from "@/lib/dossier-api";
import { getCalendarMeetingLabel } from "@/lib/calendar-dossier-meta";
import { countListEntries } from "@/lib/dossier-list-utils";
import { useTranslation } from "@/providers/PreferencesProvider";
import type { TranslationKey } from "@/i18n/types";

const quickActions: {
  href: string;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  icon: ReactNode;
}[] = [
  {
    href: "/dashboard/automation",
    labelKey: "quick.email_label",
    descKey: "quick.email_desc",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    href: "/dashboard/dossiers",
    labelKey: "quick.search_label",
    descKey: "quick.search_desc",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    href: "/dashboard/person-research",
    labelKey: "quick.person_research_label",
    descKey: "quick.person_research_desc",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/corporate",
    labelKey: "quick.corporate_label",
    descKey: "quick.corporate_desc",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path d="M3 21h18" />
        <path d="M5 21V7l8-4v18" />
        <path d="M19 21V11l-6-4" />
        <path d="M9 9v.01" />
        <path d="M9 12v.01" />
        <path d="M9 15v.01" />
        <path d="M9 18v.01" />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    labelKey: "quick.addressbook_label",
    descKey: "quick.addressbook_desc",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
];

function firstDisplayName(fullName: string, email: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts[0]) return parts[0];
  const local = email.split("@")[0]?.trim();
  return local || email;
}

function formatActivityDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function OverviewPage() {
  const { t } = useTranslation();
  const [welcomeName, setWelcomeName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const p = readDossierUserPreview();
    return p ? firstDisplayName(p.full_name, p.email) : "";
  });

  const [me, setMe] = useState<AuthUser | null>(null);
  const [dossierRows, setDossierRows] = useState<DossierListEntry[]>([]);
  const [dashError, setDashError] = useState<string | null>(null);
  const [dashLoad, setDashLoad] = useState<"idle" | "loading" | "ready">("idle");
  const [msOAuthBanner, setMsOAuthBanner] = useState<
    null | { kind: "ok" } | { kind: "error"; detail?: string }
  >(null);
  const [googleOAuthBanner, setGoogleOAuthBanner] = useState<
    null | { kind: "ok" } | { kind: "error"; detail?: string }
  >(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWelcome() {
      const preview = readDossierUserPreview();
      if (preview) {
        if (!cancelled) setWelcomeName(firstDisplayName(preview.full_name, preview.email));
        return;
      }
      const token = getStoredAccessToken();
      if (token) {
        try {
          const u = await fetchAuthMe();
          if (!cancelled) setWelcomeName(firstDisplayName(u.full_name, u.email));
        } catch {
          if (!cancelled) setWelcomeName(t("overview.anonymous"));
        }
        return;
      }
      if (!cancelled) setWelcomeName(t("overview.anonymous"));
    }

    void loadWelcome();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const ms = sp.get("calendar_microsoft");
    const g = sp.get("calendar_google");
    if (ms !== "ok" && ms !== "error" && g !== "ok" && g !== "error") return;
    const reason = sp.get("reason") || undefined;
    if (ms === "ok" || ms === "error") {
      sp.delete("calendar_microsoft");
    }
    if (g === "ok" || g === "error") {
      sp.delete("calendar_google");
    }
    sp.delete("reason");
    const rest = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    queueMicrotask(() => {
      if (ms === "ok") setMsOAuthBanner({ kind: "ok" });
      else if (ms === "error") setMsOAuthBanner({ kind: "error", detail: reason });
      if (g === "ok") setGoogleOAuthBanner({ kind: "ok" });
      else if (g === "error") setGoogleOAuthBanner({ kind: "error", detail: reason });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const token = getStoredAccessToken();
      if (!token) {
        setMe(null);
        setDossierRows([]);
        setDashLoad("idle");
        setDashError(null);
        return;
      }
      setDashLoad("loading");
      setDashError(null);
      void Promise.all([fetchAuthMe(), fetchDossiersFromApi(80)])
        .then(([user, list]) => {
          if (cancelled) return;
          setMe(user);
          setDossierRows(list.items);
          setDashLoad("ready");
        })
        .catch((e) => {
          if (cancelled) return;
          setMe(null);
          setDossierRows([]);
          setDashError(e instanceof DossierApiError ? e.message : t("overview.dashboard_load_error"));
          setDashLoad("ready");
        });
    });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const stats = useMemo(() => {
    const c = countListEntries(dossierRows);
    return { total: c.all, complete: c.complete, pending: c.needs_update };
  }, [dossierRows]);

  const activityItems = useMemo(() => {
    return [...dossierRows]
      .sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || 0).getTime();
        const tb = new Date(b.updated_at || b.created_at || 0).getTime();
        return tb - ta;
      })
      .slice(0, 6)
      .map((row) => {
        if (isDossierFolderEntry(row)) {
          return {
            id: row.id,
            title: row.title,
            subtitle: getCalendarMeetingLabel(row) || row.status,
            dateLabel: formatActivityDate(row.updated_at || row.created_at),
            href: `/dashboard/dossiers/folder/${row.id}`,
          };
        }
        return {
          id: row.id,
          title: row.subject_name || row.subject_email || "—",
          subtitle: getCalendarMeetingLabel(row) || row.status,
          dateLabel: formatActivityDate(row.updated_at || row.created_at),
          href: `/dashboard/dossiers/${row.id}`,
        };
      });
  }, [dossierRows]);

  const titleName = welcomeName || t("overview.anonymous");
  const creditsBalance = me?.credits_balance;
  const monthlyLimit = me?.credits_monthly_limit;
  const creditsTrend =
    dashLoad === "ready" && me && typeof monthlyLimit === "number" && monthlyLimit > 0
      ? t("stat.credits_monthly_hint", { limit: monthlyLimit })
      : undefined;

  return (
    <>
      <TopBar title={t("overview.title", { name: titleName })} subtitle={t("overview.subtitle")} />

      {dashError && (
        <UiAlert variant="warning" className="mb-4" role="alert">
          {dashError}
        </UiAlert>
      )}

      {msOAuthBanner && (
        <UiAlert
          variant={msOAuthBanner.kind === "ok" ? "success" : "error"}
          className="mb-4 flex flex-wrap items-start justify-between gap-2"
          role="status"
        >
          <span>
            {msOAuthBanner.kind === "ok"
              ? t("overview.microsoft_oauth_ok")
              : `${t("overview.microsoft_oauth_error")}${
                  msOAuthBanner.detail ? ` (${msOAuthBanner.detail.slice(0, 120)})` : ""
                }`}
          </span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => setMsOAuthBanner(null)}
          >
            {t("overview.microsoft_banner_close")}
          </button>
        </UiAlert>
      )}

      {googleOAuthBanner && (
        <UiAlert
          variant={googleOAuthBanner.kind === "ok" ? "success" : "error"}
          className="mb-4 flex flex-wrap items-start justify-between gap-2"
          role="status"
        >
          <span>
            {googleOAuthBanner.kind === "ok"
              ? t("overview.google_oauth_ok")
              : `${t("overview.google_oauth_error")}${
                  googleOAuthBanner.detail ? ` (${googleOAuthBanner.detail.slice(0, 120)})` : ""
                }`}
          </span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => setGoogleOAuthBanner(null)}
          >
            {t("overview.google_banner_close")}
          </button>
        </UiAlert>
      )}

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard value={dashLoad === "ready" ? stats.total : "—"} label={t("stat.total_dossiers")} />
        <StatCard value={dashLoad === "ready" ? stats.complete : "—"} label={t("stat.completed_dossiers")} />
        <StatCard
          value={dashLoad === "ready" ? stats.pending : "—"}
          label={t("stat.needs_update")}
          trendVariant={stats.pending > 0 ? "warning" : "default"}
        />
        <StatCard
          value={dashLoad === "ready" && creditsBalance != null ? creditsBalance : "—"}
          label={t("stat.credits_balance")}
          trend={creditsTrend}
        />
      </section>

      <section className="mb-8">
        <DashboardCard title={t("overview.microsoft_title")}>
          <MicrosoftOutlookPanel />
        </DashboardCard>
      </section>

      <section className="mb-8">
        <DashboardCard title={t("overview.google_title")}>
          <GoogleCalendarPanel />
        </DashboardCard>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardCard title={t("activity.title")}>
          {dashLoad === "loading" ? (
            <p className="px-3 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
              {t("dossiers.database_loading")}
            </p>
          ) : !getStoredAccessToken() ? (
            <p className="px-3 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
              {t("overview.activity_login_hint")}
            </p>
          ) : activityItems.length === 0 ? (
            <p className="px-3 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
              {t("overview.activity_empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {activityItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:opacity-95"
                    style={{ backgroundColor: "var(--bg-surface)" }}
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: "var(--bg-surface-strong)",
                        color: "var(--text-muted)",
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </div>
                    <div className="flex flex-1 flex-col min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {item.title}
                      </span>
                      <span className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>
                        {item.subtitle}
                      </span>
                    </div>
                    <span className="text-xs shrink-0" style={{ color: "var(--text-subtle)" }}>
                      {item.dateLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard title={t("quick.title")}>
          <ul className="flex flex-col gap-2">
            {quickActions.map((action) => (
              <li key={action.labelKey}>
                <Link
                  href={action.href}
                  className="group flex items-center gap-3 rounded-lg border px-3 py-3 transition hover:opacity-95"
                  style={{
                    borderColor: "var(--border-default)",
                    backgroundColor: "var(--bg-surface)",
                  }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-surface-strong)",
                      color: "var(--accent-from)",
                    }}
                  >
                    {action.icon}
                  </span>
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {t(action.labelKey)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {t(action.descKey)}
                    </span>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ color: "var(--text-subtle)" }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </DashboardCard>
      </section>
    </>
  );
}
