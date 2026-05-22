"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import StatCard from "@/components/dashboard/StatCard";
import TopBar from "@/components/dashboard/TopBar";
import NewDossierButton from "@/components/dossier/NewDossierButton";
import {
  fetchAuthMe,
  getStoredAccessToken,
  readDossierUserPreview,
} from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";
import type { TranslationKey } from "@/i18n/types";

type ActivityType = "created" | "updated" | "alert";

type Activity = {
  id: number;
  name: string;
  type: ActivityType;
  timeKey: TranslationKey;
  messageKey?: TranslationKey;
};

const activities: Activity[] = [
  { id: 1, name: "Sarah Mitchell", type: "created", timeKey: "time.2_hours_ago" },
  { id: 2, name: "James Chen", type: "updated", timeKey: "time.5_hours_ago" },
  {
    id: 3,
    name: "Michael Foster",
    type: "alert",
    timeKey: "time.1_day_ago",
    messageKey: "activity.alert_company",
  },
  { id: 4, name: "Emma Rodriguez", type: "created", timeKey: "time.2_days_ago" },
];

const quickActions: {
  href: string;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  icon: React.ReactNode;
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

function ActivityIcon({ type }: { type: ActivityType }) {
  const isAlert = type === "alert";
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
      style={{
        backgroundColor: isAlert
          ? "rgba(251, 191, 36, 0.12)"
          : "var(--bg-surface-strong)",
        color: isAlert ? "#fbbf24" : "var(--text-muted)",
      }}
    >
      {type === "created" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      )}
      {type === "updated" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      )}
      {type === "alert" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )}
    </div>
  );
}

function firstDisplayName(fullName: string, email: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts[0]) return parts[0];
  const local = email.split("@")[0]?.trim();
  return local || email;
}

export default function OverviewPage() {
  const { t } = useTranslation();
  const [welcomeName, setWelcomeName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const p = readDossierUserPreview();
    return p ? firstDisplayName(p.full_name, p.email) : "";
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const preview = readDossierUserPreview();
      if (preview) {
        if (!cancelled) setWelcomeName(firstDisplayName(preview.full_name, preview.email));
        return;
      }
      const token = getStoredAccessToken();
      if (token) {
        try {
          const me = await fetchAuthMe();
          if (!cancelled) setWelcomeName(firstDisplayName(me.full_name, me.email));
        } catch {
          if (!cancelled) setWelcomeName(t("overview.anonymous"));
        }
        return;
      }
      if (!cancelled) setWelcomeName("John");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const titleName = welcomeName || t("overview.anonymous");
    <>
      <TopBar
        title={t("overview.title", { name: titleName })}
        subtitle={t("overview.subtitle")}
        action={<NewDossierButton />}
      />

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          value="47"
          label={t("stat.total_dossiers")}
          trend={t("stat.total_trend")}
          trendVariant="positive"
        />
        <StatCard
          value="23"
          label={t("stat.auto_generated")}
          trend={t("stat.auto_trend")}
        />
        <StatCard
          value="8"
          label={t("stat.needs_update")}
          trend={t("stat.needs_trend")}
          trendVariant="warning"
        />
        <StatCard
          value="156"
          label={t("stat.credits_used")}
          trend={t("stat.credits_trend")}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardCard title={t("activity.title")}>
          <ul className="flex flex-col gap-3">
            {activities.map((activity) => (
              <li
                key={activity.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ backgroundColor: "var(--bg-surface)" }}
              >
                <ActivityIcon type={activity.type} />
                <div className="flex flex-1 flex-col">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {activity.name}
                  </span>
                  {activity.messageKey && (
                    <span
                      className="text-xs font-medium"
                      style={{ color: "#fbbf24" }}
                    >
                      {t(activity.messageKey)}
                    </span>
                  )}
                </div>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-subtle)" }}
                >
                  {t(activity.timeKey)}
                </span>
              </li>
            ))}
          </ul>
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
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {t(action.labelKey)}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
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
