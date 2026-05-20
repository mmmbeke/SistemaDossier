"use client";

import Link from "next/link";
import DashboardCard from "@/components/dashboard/DashboardCard";
import AlertsPanel from "@/components/dossier/AlertsPanel";
import BadgeChip from "@/components/dossier/BadgeChip";
import CareerTimeline from "@/components/dossier/CareerTimeline";
import CorporateRecordsList from "@/components/dossier/CorporateRecordsList";
import IceBreakersPanel from "@/components/dossier/IceBreakersPanel";
import StatusIndicator from "@/components/dossier/StatusIndicator";
import { usePreferences } from "@/providers/PreferencesProvider";
import { formatLongDate } from "@/lib/format";
import { formatTenure, type Dossier } from "@/lib/mock-dossiers";

type DossierDetailViewProps = {
  dossier: Dossier;
};

export default function DossierDetailView({ dossier }: DossierDetailViewProps) {
  const { t, preferences } = usePreferences();

  const updatedDate = formatLongDate(dossier.updated_at, preferences);

  const criticalAlerts = dossier.alerts.filter((a) => a.level === "critical")
    .length;
  const warningAlerts = dossier.alerts.filter((a) => a.level === "warning")
    .length;

  return (
    <>
      <nav className="mb-6 flex items-center gap-2 text-sm">
        <Link
          href="/dashboard/dossiers"
          className="inline-flex items-center gap-1.5 transition hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t("detail.back")}
        </Link>
      </nav>

      <header
        className="mb-8 flex flex-col gap-6 rounded-xl border p-6 lg:flex-row lg:items-start"
        style={{
          borderColor: "var(--border-default)",
          backgroundImage:
            "linear-gradient(180deg, var(--bg-card-start) 0%, var(--bg-card-end) 100%)",
        }}
      >
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white"
          style={{
            backgroundImage:
              "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
          }}
        >
          {dossier.initials}
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <BadgeChip badge={dossier.identity.badge} />
            <StatusIndicator freshness={dossier.freshness} />
          </div>
          <div>
            <h1
              className="text-3xl font-bold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {dossier.identity.name}
            </h1>
            <p className="text-base" style={{ color: "var(--text-muted)" }}>
              {dossier.identity.current_role} {t("common.at_company")}{" "}
              {dossier.identity.company}
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex flex-col">
              <dt
                className="text-xs uppercase tracking-wider"
                style={{ color: "var(--text-subtle)" }}
              >
                {t("detail.tenure")}
              </dt>
              <dd style={{ color: "var(--text-primary)" }}>
                {formatTenure(dossier.identity.tenure_months)}
              </dd>
            </div>
            {dossier.identity.location && (
              <div className="flex flex-col">
                <dd style={{ color: "var(--text-primary)" }}>
                  {dossier.identity.location}
                </dd>
              </div>
            )}
            <div className="flex flex-col">
              <dd style={{ color: "var(--text-primary)" }}>
                {t("detail.updated", { date: updatedDate })}
              </dd>
            </div>
            <div className="flex flex-col">
              <dd
                className="capitalize"
                style={{
                  color:
                    dossier.status === "complete"
                      ? "#34d399"
                      : dossier.status === "partial"
                      ? "#fbbf24"
                      : "#ef4444",
                }}
              >
                {dossier.status}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-2">
          <button
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:opacity-95"
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {t("detail.refresh")}
          </button>
        </div>
      </header>

      {dossier.alerts.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {t("detail.alerts")}
            </h2>
            <span
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {criticalAlerts > 0 &&
                t("detail.critical_alerts", { count: criticalAlerts })}
              {criticalAlerts > 0 && warningAlerts > 0 && " · "}
              {warningAlerts > 0 &&
                t("detail.warning_alerts", { count: warningAlerts })}
            </span>
          </div>
          <AlertsPanel alerts={dossier.alerts} />
        </section>
      )}

      <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DashboardCard title={t("detail.career")}>
            <CareerTimeline entries={dossier.career_timeline} />
          </DashboardCard>
        </div>

        <div className="flex flex-col gap-6">
          {dossier.alerts.length === 0 && (
            <DashboardCard title={t("detail.alerts")}>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("detail.no_alerts")}
              </p>
            </DashboardCard>
          )}

          <DashboardCard title={t("detail.corporate_records")}>
            <CorporateRecordsList records={dossier.corporate_records} />
          </DashboardCard>
        </div>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardCard title={t("detail.ice_breakers")}>
          <IceBreakersPanel iceBreakers={dossier.ice_breakers} />
        </DashboardCard>

        <DashboardCard title={t("detail.module_media")}>
          <ul className="flex flex-wrap gap-2">
            {dossier.data_sources.map((src) => (
              <li
                key={src}
                className="rounded-full border px-3 py-1 text-xs"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                }}
              >
                {src}
              </li>
            ))}
          </ul>
        </DashboardCard>
      </section>
    </>
  );
}
