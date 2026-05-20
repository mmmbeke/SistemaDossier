"use client";

import Link from "next/link";
import type { Dossier } from "@/lib/mock-dossiers";
import { formatDate } from "@/lib/format";
import { usePreferences } from "@/providers/PreferencesProvider";
import BadgeChip from "./BadgeChip";
import StatusIndicator from "./StatusIndicator";

export default function DossierCard({ dossier }: { dossier: Dossier }) {
  const { t, preferences } = usePreferences();
  const hasAlert = dossier.alerts.length > 0;
  const formattedDate = formatDate(dossier.updated_at, preferences);

  return (
    <Link
      href={`/dashboard/dossiers/${dossier.id}`}
      className="group flex flex-col gap-4 rounded-xl border p-5 transition hover:border-strong"
      style={{
        borderColor: "var(--border-default)",
        backgroundImage:
          "linear-gradient(180deg, var(--bg-card-start) 0%, var(--bg-card-end) 100%)",
      }}
    >
      <header className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{
            backgroundImage:
              "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
          }}
        >
          {dossier.initials}
        </div>
        <div className="flex flex-1 flex-col">
          <span
            className="text-base font-semibold leading-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {dossier.identity.name}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {dossier.identity.current_role} {t("common.at_company")}{" "}
            {dossier.identity.company}
          </span>
        </div>
        {hasAlert && (
          <span
            className="relative flex h-2.5 w-2.5"
            title={t("common.has_alerts")}
          >
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ backgroundColor: "#ef4444" }}
            />
            <span
              className="relative inline-flex h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "#ef4444" }}
            />
          </span>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <BadgeChip badge={dossier.identity.badge} />
        <StatusIndicator freshness={dossier.freshness} />
      </div>

      <footer
        className="flex items-center justify-between border-t pt-3 text-xs"
        style={{
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <span className="inline-flex items-center gap-1.5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-3.5 w-3.5"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {formattedDate}
        </span>
        <span className="font-medium" style={{ color: "var(--accent-from)" }}>
          {t("common.view_dossier")}
        </span>
      </footer>
    </Link>
  );
}
