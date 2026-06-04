"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import { usePreferences } from "@/providers/PreferencesProvider";
import {
  DossierApiError,
  fetchAuthMe,
  getStoredAccessToken,
  patchOrganizationDossierContext,
  type AuthUser,
} from "@/lib/dossier-api";

export default function CompanyContextPanel() {
  const { t } = usePreferences();
  const [me, setMe] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setLoading(false);
      setLoadError(t("settings.company.load_error"));
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const u = await fetchAuthMe();
      setMe(u);
      setSummary(u.organization_company_summary ?? "");
      setIndustry(u.organization_industry_or_area ?? "");
    } catch (e) {
      setMe(null);
      setLoadError(e instanceof DossierApiError ? e.message : t("settings.company.load_error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const isAdmin = me?.role === "admin";

  async function handleSave() {
    if (!me || !isAdmin) return;
    setActionError(null);
    setSaving(true);
    try {
      const updated = await patchOrganizationDossierContext({
        company_summary: summary,
        industry_or_area: industry,
      });
      setMe(updated);
      setSummary(updated.organization_company_summary ?? "");
      setIndustry(updated.organization_industry_or_area ?? "");
    } catch (e) {
      const msg = e instanceof DossierApiError ? e.message : t("settings.company.load_error");
      setActionError(e instanceof DossierApiError && e.status === 403 ? t("settings.company.read_only") : msg);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    color: "var(--text-primary)",
    backgroundColor: "var(--bg-surface)",
    borderColor: "var(--border-default)",
  } as const;

  return (
    <div className="flex flex-col gap-6">
      <DashboardCard title={t("settings.company.title")}>
        <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
          {t("settings.company.subtitle")}
        </p>

        {loadError ? (
          <p className="text-sm" style={{ color: "var(--accent-danger, #f87171)" }}>
            {loadError}
          </p>
        ) : null}
        {actionError ? (
          <p className="text-sm" style={{ color: "var(--accent-danger, #f87171)" }}>
            {actionError}
          </p>
        ) : null}

        {loading && !me && !loadError ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("billing.loading")}
          </p>
        ) : null}

        {me ? (
          <div className="flex flex-col gap-4">
            {!isAdmin ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("settings.company.read_only")}
              </p>
            ) : null}

            <label className="flex flex-col gap-1.5 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {t("settings.company.summary_label")}
              <textarea
                className="min-h-[120px] rounded-lg border px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/40"
                style={inputStyle}
                disabled={!isAdmin || saving}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                maxLength={4000}
                placeholder={t("settings.company.summary_placeholder")}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {t("settings.company.industry_label")}
              <textarea
                className="min-h-[72px] rounded-lg border px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/40"
                style={inputStyle}
                disabled={!isAdmin || saving}
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                maxLength={500}
                placeholder={t("settings.company.industry_placeholder")}
              />
            </label>

            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
              {t("settings.company.hint")}
            </p>

            {isAdmin ? (
              <button
                type="button"
                className="self-start rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  backgroundImage: "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
                }}
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? t("settings.company.saving") : t("settings.company.save")}
              </button>
            ) : null}
          </div>
        ) : null}
      </DashboardCard>
    </div>
  );
}
