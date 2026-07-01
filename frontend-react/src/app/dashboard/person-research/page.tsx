"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import TopBar from "@/components/dashboard/TopBar";
import FormField from "@/components/FormField";
import PrimaryButton from "@/components/PrimaryButton";
import {
  DossierApiError,
  fetchAuthMe,
  getStoredAccessToken,
  type AuthUser,
  type PersonResearchApiResponse,
  type PersonResearchPayload,
} from "@/lib/dossier-api";
import { resolveDossierOutputLanguage } from "@/lib/resolve-output-language";
import { useDossierJobs } from "@/providers/DossierJobsProvider";
import { usePreferences, useTranslation } from "@/providers/PreferencesProvider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ResearchSourceUi = "gemini_web" | "pdl";

const PERSON_RESEARCH_CREDITS = 1;

function formatPlanSummary(me: AuthUser | null, unlimitedLabel: string): string {
  const plan = (me?.organization_plan ?? "free").trim();
  const label = plan.charAt(0).toUpperCase() + plan.slice(1);
  const monthly = me?.credits_monthly_limit ?? 0;
  if (monthly >= 999_999) return `${label} · ${unlimitedLabel}`;
  return `${label} · ${monthly} cr/mes`;
}

function estimatePersonResearchEta(source: ResearchSourceUi, maxProfiles: number): number {
  if (source === "gemini_web") return 35;
  return 40 + Math.max(0, Math.min(5, maxProfiles) - 1) * 12;
}

export default function PersonResearchPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { preferences } = usePreferences();
  const { enqueuePersonResearchJob, cancelJob, getActivePersonJob, jobs } = useDossierJobs();
  const [researchSource, setResearchSource] = useState<ResearchSourceUi>("pdl");
  const [fullName, setFullName] = useState("");
  const [jobArea, setJobArea] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [extraKeywords, setExtraKeywords] = useState("");
  const [maxProfiles, setMaxProfiles] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PersonResearchApiResponse | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const redirectAfterSaveRef = useRef<string | null>(null);
  const usesEnrichment = researchSource === "pdl";

  const summaryScopeKey =
    researchSource === "pdl"
      ? "person_research.summary_scope_pdl"
      : "person_research.summary_scope_gemini";
  const estimatedEta = estimatePersonResearchEta(researchSource, maxProfiles);
  const planSummary = useMemo(
    () => formatPlanSummary(me, t("billing.unlimited")),
    [me, t],
  );

  const activeJob =
    jobs.find((j) => j.id === activeJobId) ?? getActivePersonJob() ?? null;
  const isGenerating =
    activeJob?.status === "queued" || activeJob?.status === "running";

  useEffect(() => {
    if (!getStoredAccessToken()) return;
    void fetchAuthMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (!activeJobId) return;
    const job = jobs.find((j) => j.id === activeJobId);
    if (!job) return;
    if (job.status === "completed" && job.result) {
      const personResult = job.result as PersonResearchApiResponse;
      setResult(personResult);
      setActiveJobId(null);
      const dossierId = personResult.saved_dossier?.id;
      if (dossierId && redirectAfterSaveRef.current !== dossierId) {
        redirectAfterSaveRef.current = dossierId;
        router.push(`/dashboard/dossiers/${dossierId}`);
      }
    }
    if (job.status === "failed" || job.status === "cancelled") {
      setActiveJobId(null);
      if (job.status === "failed" && job.error_message) {
        setError(job.error_message);
      }
    }
  }, [jobs, activeJobId, router]);

  function buildPayload(name: string, forceRefresh = false): PersonResearchPayload {
    const payload: PersonResearchPayload = {
      full_name: name,
      research_source: researchSource,
      max_profiles: usesEnrichment ? Math.min(5, Math.max(1, maxProfiles)) : 1,
      output_language: resolveDossierOutputLanguage(preferences),
    };
    const ja = jobArea.trim();
    const co = company.trim();
    const em = email.trim();
    const li = linkedinUrl.trim();
    const cu = country.trim();
    const ci = city.trim();
    const ex = extraKeywords.trim();
    if (ja) payload.job_area = ja;
    if (co) payload.company = co;
    if (em) payload.email = em;
    if (li) payload.linkedin_url = li;
    if (cu) payload.country = cu;
    if (ci) payload.city = ci;
    if (ex) payload.extra_keywords = ex;
    if (forceRefresh) payload.force_refresh = true;
    return payload;
  }

  async function startResearch(forceRefresh: boolean) {
    setError("");
    if (!forceRefresh) setResult(null);
    const name = fullName.trim();
    if (name.length < 2) {
      setError(t("person_research.error_name"));
      return;
    }
    if (!getStoredAccessToken()) {
      setError(t("person_research.error_auth"));
      return;
    }
    if (isGenerating) {
      setError(t("person_research.already_generating"));
      return;
    }

    setSubmitting(true);
    try {
      const jobId = await enqueuePersonResearchJob(buildPayload(name, forceRefresh));
      setActiveJobId(jobId);
    } catch (err) {
      if (err instanceof DossierApiError) {
        setError(err.message || t("generate.error.api"));
      } else {
        setError(t("generate.error.api"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await startResearch(false);
  }

  async function handleRegenerate() {
    await startResearch(true);
  }

  async function handleCancelGeneration() {
    if (!activeJob?.id) return;
    setError("");
    try {
      await cancelJob(activeJob.id);
      setActiveJobId(null);
    } catch (err) {
      if (err instanceof DossierApiError) {
        setError(err.message || t("person_research.cancel_error"));
      } else {
        setError(t("person_research.cancel_error"));
      }
    }
  }

  return (
    <>
      <nav className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm transition hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t("person_research.back")}
        </Link>
      </nav>

      <TopBar title={t("person_research.title")} subtitle={t("person_research.subtitle")} />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5">
          <div className="lg:col-span-3">
        <DashboardCard title={t("person_research.section_filters")}>
          <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)}>
            <div>
              <p className="mb-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                {t("person_research.source_label")}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    {
                      id: "pdl" as const,
                      title: t("person_research.source_pdl"),
                      hint: t("person_research.source_pdl_hint"),
                    },
                    {
                      id: "gemini_web" as const,
                      title: t("person_research.source_gemini"),
                      hint: t("person_research.source_gemini_hint"),
                    },
                  ] as const
                ).map((option) => {
                  const selected = researchSource === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setResearchSource(option.id)}
                      className="rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        borderColor: selected ? "var(--accent-from)" : "var(--border-default)",
                        backgroundColor: selected
                          ? "rgba(0, 183, 235, 0.08)"
                          : "var(--bg-surface)",
                        boxShadow: selected ? "0 0 0 1px rgba(0, 183, 235, 0.35)" : undefined,
                      }}
                    >
                      <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {option.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug line-clamp-2" style={{ color: "var(--text-muted)" }}>
                        {option.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField
                  label={t("person_research.full_name")}
                  name="full_name"
                  placeholder={t("person_research.full_name_ph")}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={isGenerating}
                />
              </div>
              <FormField
                label={t("person_research.job_area")}
                name="job_area"
                placeholder={t("person_research.job_area_ph")}
                value={jobArea}
                onChange={(e) => setJobArea(e.target.value)}
                disabled={isGenerating}
              />
              <FormField
                label={t("person_research.company")}
                name="company"
                placeholder={t("person_research.company_ph")}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={isGenerating}
              />
              <FormField
                label={t("person_research.email")}
                name="email"
                placeholder={t("person_research.email_ph")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isGenerating}
              />
              <FormField
                label={t("person_research.linkedin_url")}
                name="linkedin_url"
                placeholder={t("person_research.linkedin_url_ph")}
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                disabled={isGenerating}
              />
              <FormField
                label={t("person_research.country")}
                name="country"
                placeholder={t("person_research.country_ph")}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={isGenerating}
              />
              <FormField
                label={t("person_research.city")}
                name="city"
                placeholder={t("person_research.city_ph")}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={isGenerating}
              />
              <div className={usesEnrichment ? "" : "sm:col-span-2"}>
                <FormField
                  label={t("person_research.extra_keywords")}
                  name="extra_keywords"
                  placeholder={t("person_research.extra_keywords_ph")}
                  value={extraKeywords}
                  onChange={(e) => setExtraKeywords(e.target.value)}
                  disabled={isGenerating}
                />
              </div>
              {usesEnrichment ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                    {t("person_research.max_profiles")}
                  </label>
                  <input
                    type="number"
                    name="max_profiles"
                    min={1}
                    max={5}
                    className="w-full max-w-[7rem] rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:ring-2 sm:w-24"
                    style={{
                      borderColor: "var(--border-default)",
                      backgroundColor: "var(--bg-input)",
                      color: "var(--text-primary)",
                    }}
                    value={maxProfiles}
                    onChange={(e) => setMaxProfiles(Number(e.target.value))}
                    disabled={isGenerating}
                  />
                </div>
              ) : null}
            </div>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}

            {isGenerating ? (
              <div
                className="rounded-lg border px-4 py-3 text-sm"
                style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
              >
                <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {t("person_research.generating_title", {
                    name: activeJob?.meeting_label || fullName.trim(),
                  })}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("person_research.generating_background")}
                </p>
                <div
                  className="mt-3 h-1 w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: "var(--border-default)" }}
                >
                  <div
                    className="h-full w-1/3 animate-pulse rounded-full"
                    style={{ backgroundColor: "var(--accent-primary)" }}
                  />
                </div>
                <button
                  type="button"
                  className="mt-3 text-xs font-medium text-red-300 hover:text-red-200"
                  onClick={() => void handleCancelGeneration()}
                >
                  {t("person_research.cancel")}
                </button>
              </div>
            ) : (
              <div
                className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-center"
                style={{ borderColor: "var(--border-default)" }}
              >
                <PrimaryButton type="submit" loading={submitting} className="w-full sm:w-auto">
                  {PERSON_RESEARCH_CREDITS === 1
                    ? t("generate.submit_one")
                    : t("generate.submit", { credits: PERSON_RESEARCH_CREDITS })}
                </PrimaryButton>
                <button
                  type="button"
                  disabled={submitting}
                  title={t("person_research.regenerate_hint")}
                  onClick={() => void handleRegenerate()}
                  className="inline-flex w-full items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
                  style={{
                    borderColor: "var(--border-default)",
                    color: "var(--accent-from)",
                  }}
                >
                  {t("person_research.regenerate")}
                </button>
              </div>
            )}
          </form>
        </DashboardCard>
          </div>

          <div className="lg:col-span-2">
            <DashboardCard title={t("generate.summary")}>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt style={{ color: "var(--text-muted)" }}>{t("generate.plan")}</dt>
                  <dd className="text-right" style={{ color: "var(--text-primary)" }}>
                    {planSummary}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt style={{ color: "var(--text-muted)" }}>{t("generate.credits_cost")}</dt>
                  <dd style={{ color: "var(--accent-from)" }}>{PERSON_RESEARCH_CREDITS}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt style={{ color: "var(--text-muted)" }}>{t("generate.eta")}</dt>
                  <dd style={{ color: "var(--text-primary)" }}>~{estimatedEta}s</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt style={{ color: "var(--text-muted)" }}>{t("generate.modules")}</dt>
                  <dd
                    className="max-w-[65%] text-right text-xs leading-snug"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {t(summaryScopeKey)}
                  </dd>
                </div>
              </dl>
            </DashboardCard>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {result?.warnings?.length ? (
            <DashboardCard title={t("person_research.warn_title")}>
              <ul className="ui-text-warning list-inside list-disc text-sm">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </DashboardCard>
          ) : null}

          {result?.saved_dossier?.id ? (
            <DashboardCard title={t("person_research.saved_title")}>
              {result.dossier_source === "redis_cache" ? (
                <div
                  className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
                  style={{
                    color: "var(--alert-info-text)",
                    backgroundColor: "var(--alert-info-bg)",
                    borderColor: "var(--alert-info-border)",
                  }}
                >
                  {t("person_research.cache_badge")}
                </div>
              ) : null}
              <p className="mb-3 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {t("person_research.saved_body")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/dashboard/dossiers/${result.saved_dossier.id}`}
                  className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
                  }}
                >
                  {t("person_research.saved_open")}
                </Link>
                <Link
                  href="/dashboard/dossiers"
                  className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition hover:opacity-90"
                  style={{ borderColor: "var(--border-default)", color: "var(--accent-from)" }}
                >
                  {t("person_research.saved_list")}
                </Link>
              </div>
            </DashboardCard>
          ) : null}

          {result?.gemini_analysis_markdown ? (
            <DashboardCard title={t("person_research.section_analysis")}>
              <div
                className="api-md max-w-none text-sm leading-relaxed"
                style={{ color: "var(--text-primary)" }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {result.gemini_analysis_markdown}
                </ReactMarkdown>
              </div>
            </DashboardCard>
          ) : result && !isGenerating ? (
            <DashboardCard title={t("person_research.section_analysis")}>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("person_research.no_analysis")}
              </p>
              <button
                type="button"
                disabled={submitting}
                title={t("person_research.regenerate_hint")}
                onClick={() => void handleRegenerate()}
                className="mt-4 inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
                style={{
                  borderColor: "var(--border-default)",
                  color: "var(--accent-from)",
                }}
              >
                {t("person_research.regenerate")}
              </button>
            </DashboardCard>
          ) : null}

          {result &&
          (result.filters_applied?.research_source === "pdl" ||
            result.filters_applied?.research_source === "gemini_web" ||
            (Array.isArray(result.search_attempts) && result.search_attempts.length > 0) ||
            (Array.isArray(result.profile_urls) && result.profile_urls.length > 0)) ? (
            <DashboardCard title={t("person_research.section_raw")}>
              <button
                type="button"
                className="mb-3 text-xs font-medium underline-offset-2 hover:underline"
                style={{ color: "var(--accent-from)" }}
                onClick={() => setShowRaw((v) => !v)}
              >
                {t("person_research.toggle_raw")}
              </button>
              {showRaw ? (
                <pre
                  className="max-h-[480px] overflow-auto rounded-lg border p-3 text-xs leading-relaxed"
                  style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
                >
                  {JSON.stringify(
                    {
                      filters_applied: result.filters_applied,
                      search_attempts: result.search_attempts,
                      profile_urls: result.profile_urls,
                      profiles: result.profiles,
                      posts_by_url: result.posts_by_url,
                    },
                    null,
                    2
                  )}
                </pre>
              ) : null}
            </DashboardCard>
          ) : null}
        </div>
      </div>
    </>
  );
}
