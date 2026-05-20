"use client";

import DashboardCard from "@/components/dashboard/DashboardCard";
import { usePreferences } from "@/providers/PreferencesProvider";
import type { TranslationKey } from "@/i18n/types";
import { formatDate } from "@/lib/format";
import { CURRENT_USAGE, PLANS, type PlanTier } from "@/lib/mock-billing";

const PLAN_FEATURE_KEYS: Record<PlanTier, TranslationKey[]> = {
  free: [
    "billing.free_features_0",
    "billing.free_features_1",
    "billing.free_features_2",
  ],
  pro: [
    "billing.pro_features_0",
    "billing.pro_features_1",
    "billing.pro_features_2",
  ],
  enterprise: [
    "billing.enterprise_features_0",
    "billing.enterprise_features_1",
    "billing.enterprise_features_2",
  ],
};

export default function BillingPanel() {
  const { t, preferences } = usePreferences();
  const usagePercent = Math.round(
    (CURRENT_USAGE.creditsUsed / CURRENT_USAGE.creditsTotal) * 100
  );
  const cycleEnd = formatDate(CURRENT_USAGE.billingCycleEnd, preferences);

  return (
    <div className="flex flex-col gap-6">
      <DashboardCard title={t("billing.usage_title")}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("billing.current_plan")}
              </p>
              <p
                className="text-xl font-bold capitalize"
                style={{ color: "var(--text-primary)" }}
              >
                {CURRENT_USAGE.plan}
              </p>
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.10)",
                color: "var(--accent-from)",
              }}
            >
              {t("billing.renews", { date: cycleEnd })}
            </span>
          </div>

          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>{t("billing.credits_used")}</span>
              <span style={{ color: "var(--text-primary)" }}>
                {CURRENT_USAGE.creditsUsed} / {CURRENT_USAGE.creditsTotal}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--bg-surface-strong)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${usagePercent}%`,
                  backgroundImage:
                    usagePercent > 80
                      ? "linear-gradient(90deg, #fbbf24, #ef4444)"
                      : "linear-gradient(90deg, var(--accent-from), var(--accent-to))",
                }}
              />
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--text-subtle)" }}>
              {t("billing.credits_hint")}
            </p>
          </div>
        </div>
      </DashboardCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className="flex flex-col gap-4 rounded-xl border p-5"
            style={{
              borderColor: plan.highlighted
                ? "var(--accent-from)"
                : "var(--border-default)",
              backgroundImage:
                "linear-gradient(180deg, var(--bg-card-start) 0%, var(--bg-card-end) 100%)",
              boxShadow: plan.highlighted
                ? "0 0 0 1px rgba(59, 130, 246, 0.25)"
                : undefined,
            }}
          >
            <div>
              <h4
                className="text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                {plan.name}
              </h4>
              <p className="text-sm" style={{ color: "var(--accent-from)" }}>
                {plan.price}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                {plan.credits}
              </p>
            </div>
            <ul className="flex flex-1 flex-col gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
              {PLAN_FEATURE_KEYS[plan.id].map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <span style={{ color: "#34d399" }}>✓</span>
                  {t(key)}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-semibold transition hover:opacity-95"
              style={
                plan.id === CURRENT_USAGE.plan
                  ? {
                      border: "1px solid var(--border-default)",
                      color: "var(--text-muted)",
                      backgroundColor: "var(--bg-surface)",
                    }
                  : {
                      color: "white",
                      backgroundImage:
                        "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
                    }
              }
              disabled={plan.id === CURRENT_USAGE.plan}
            >
              {plan.id === CURRENT_USAGE.plan
                ? t("billing.current_plan_btn")
                : t("billing.upgrade")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
