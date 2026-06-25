"use client";

import Link from "next/link";
import { useState } from "react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import TopBar from "@/components/dashboard/TopBar";
import FormField from "@/components/FormField";
import PrimaryButton from "@/components/PrimaryButton";
import {
  DossierApiError,
  getStoredAccessToken,
  postPersonResearch,
  type PersonResearchApiResponse,
  type PersonResearchPayload,
} from "@/lib/dossier-api";
import { usePreferences, useTranslation } from "@/providers/PreferencesProvider";
import { resolveDossierOutputLanguage } from "@/lib/resolve-output-language";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ResearchSourceUi = "gemini_web" | "pdl";

export default function PersonResearchPage() {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PersonResearchApiResponse | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const usesEnrichment = researchSource === "pdl";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    const name = fullName.trim();
    if (name.length < 2) {
      setError(t("person_research.error_name"));
      return;
    }
    if (!getStoredAccessToken()) {
      setError(t("person_research.error_auth"));
      return;
    }

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

    setLoading(true);
    try {
      const data = await postPersonResearch(payload);
      setResult(data);
    } catch (err) {
      if (err instanceof DossierApiError) {
        setError(err.message || t("generate.error.api"));
      } else {
        setError(t("generate.error.api"));
      }
    } finally {
      setLoading(false);
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardCard title={t("person_research.section_filters")}>
          <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)}>
            <fieldset className="flex flex-col gap-2 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border-default)" }}>
              <legend className="px-1 font-medium" style={{ color: "var(--text-secondary)" }}>
                {t("person_research.source_label")}
              </legend>
              <label className="flex cursor-pointer items-start gap-2" style={{ color: "var(--text-primary)" }}>
                <input
                  type="radio"
                  name="research_source"
                  checked={researchSource === "pdl"}
                  onChange={() => setResearchSource("pdl")}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{t("person_research.source_pdl")}</span>
                  <span className="mt-0.5 block text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("person_research.source_pdl_hint")}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2" style={{ color: "var(--text-primary)" }}>
                <input
                  type="radio"
                  name="research_source"
                  checked={researchSource === "gemini_web"}
                  onChange={() => setResearchSource("gemini_web")}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{t("person_research.source_gemini")}</span>
                  <span className="mt-0.5 block text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("person_research.source_gemini_hint")}
                  </span>
                </span>
              </label>
            </fieldset>

            <FormField
              label={t("person_research.full_name")}
              name="full_name"
              placeholder={t("person_research.full_name_ph")}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <FormField
              label={t("person_research.job_area")}
              name="job_area"
              placeholder={t("person_research.job_area_ph")}
              value={jobArea}
              onChange={(e) => setJobArea(e.target.value)}
            />
            <FormField
              label={t("person_research.company")}
              name="company"
              placeholder={t("person_research.company_ph")}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
            <FormField
              label={t("person_research.email")}
              name="email"
              placeholder={t("person_research.email_ph")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <FormField
              label={t("person_research.linkedin_url")}
              name="linkedin_url"
              placeholder={t("person_research.linkedin_url_ph")}
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
            />
            <FormField
              label={t("person_research.country")}
              name="country"
              placeholder={t("person_research.country_ph")}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
            <FormField
              label={t("person_research.city")}
              name="city"
              placeholder={t("person_research.city_ph")}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <FormField
              label={t("person_research.extra_keywords")}
              name="extra_keywords"
              placeholder={t("person_research.extra_keywords_ph")}
              value={extraKeywords}
              onChange={(e) => setExtraKeywords(e.target.value)}
            />

            {usesEnrichment ? (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                    {t("person_research.max_profiles")}
                  </label>
                  <input
                    type="number"
                    name="max_profiles"
                    min={1}
                    max={5}
                    className="w-24 rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
                    value={maxProfiles}
                    onChange={(e) => setMaxProfiles(Number(e.target.value))}
                  />
                </div>
              </>
            ) : null}

            {error ? <p className="text-sm text-red-400">{error}</p> : null}

            <PrimaryButton type="submit" loading={loading}>
              {t("person_research.submit")}
            </PrimaryButton>
          </form>
        </DashboardCard>

        <div className="flex flex-col gap-6">
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {t("person_research.disclaimer")}
          </p>

          {result?.warnings?.length ? (
            <DashboardCard title={t("person_research.warn_title")}>
              <ul className="list-inside list-disc text-sm text-amber-300/90">
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
                    borderColor: "rgba(56,189,248,0.35)",
                    color: "#7dd3fc",
                    backgroundColor: "rgba(56,189,248,0.08)",
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
          ) : result ? (
            <DashboardCard title={t("person_research.section_analysis")}>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("person_research.no_analysis")}
              </p>
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
