"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DashboardCard from "@/components/dashboard/DashboardCard";
import CalendarMeetingLabel from "@/components/dossier/CalendarMeetingLabel";
import DeleteDossierIconButton from "@/components/dossier/DeleteDossierIconButton";
import {
  DossierApiError,
  deleteDossierFromApi,
  getStoredAccessToken,
  type DossierDetailResponse,
  type PersonResearchApiResponse,
  type PersonResearchPayload,
} from "@/lib/dossier-api";
import { resolveDossierOutputLanguage } from "@/lib/resolve-output-language";
import { useDossierJobs } from "@/providers/DossierJobsProvider";
import { useTranslation } from "@/providers/PreferencesProvider";
import { formatLongDate } from "@/lib/format";

const EMPTY_REPORT_MARKERS = new Set([
  "(No se generó texto de informe tras la búsqueda.)",
  "(Gemini devolvió texto vacío.)",
]);

function reportBodyIsPresent(body: string): boolean {
  const t = body.trim();
  return Boolean(t) && !EMPTY_REPORT_MARKERS.has(t);
}

type Props = {
  dossier: DossierDetailResponse;
};

function parseDossierData(data: unknown): {
  body: string;
  pipeline: string | null;
  success: boolean | null;
  cacheHit: boolean;
} {
  if (!data || typeof data !== "object") {
    return {
      body: "",
      pipeline: null,
      success: null,
      cacheHit: false,
    };
  }
  const o = data as Record<string, unknown>;
  const cache = o.cache && typeof o.cache === "object" ? (o.cache as Record<string, unknown>) : null;
  return {
    body: typeof o.body === "string" ? o.body : "",
    pipeline: typeof o.pipeline === "string" ? o.pipeline : null,
    success: typeof o.success === "boolean" ? o.success : null,
    cacheHit: cache?.hit === true,
  };
}

function refineHrefForDossier(subject: string | null, pipeline: string | null): string {
  if (pipeline === "person_research") {
    return "/dashboard/person-research";
  }
  const q = (subject ?? "").trim();
  const base = "/dashboard/corporate";
  if (!q) return base;
  return `${base}?q=${encodeURIComponent(q)}&pick=1`;
}

function buildPersonResearchPayloadFromDossier(
  dossier: DossierDetailResponse,
  outputLanguage: string,
  forceRefresh: boolean,
): PersonResearchPayload | null {
  const dd = dossier.dossier_data;
  if (!dd || typeof dd !== "object") return null;
  const root = dd as Record<string, unknown>;
  const pf = root.person_filters;
  const filters =
    pf && typeof pf === "object" ? (pf as Record<string, unknown>) : {};

  const name = (
    typeof filters.full_name === "string" ? filters.full_name : dossier.subject_name || ""
  ).trim();
  if (name.length < 2) return null;

  const rs =
    typeof filters.research_source === "string" ? filters.research_source.trim() : "pdl";
  const payload: PersonResearchPayload = {
    full_name: name,
    research_source: rs === "gemini_web" ? "gemini_web" : "pdl",
    max_profiles: 1,
    output_language:
      typeof root.output_language === "string" && root.output_language.trim()
        ? root.output_language.trim()
        : outputLanguage,
  };

  const email =
    (typeof filters.email === "string" ? filters.email : dossier.subject_email || "").trim();
  const company = typeof filters.company === "string" ? filters.company.trim() : "";
  const jobArea = typeof filters.job_area === "string" ? filters.job_area.trim() : "";
  const country = typeof filters.country === "string" ? filters.country.trim() : "";
  const city = typeof filters.city === "string" ? filters.city.trim() : "";
  const extra =
    typeof filters.extra_keywords === "string" ? filters.extra_keywords.trim() : "";
  const linkedin =
    typeof filters.linkedin_url === "string" ? filters.linkedin_url.trim() : "";

  if (email) payload.email = email;
  if (company) payload.company = company;
  if (jobArea) payload.job_area = jobArea;
  if (country) payload.country = country;
  if (city) payload.city = city;
  if (extra) payload.extra_keywords = extra;
  if (linkedin) payload.linkedin_url = linkedin;
  if (forceRefresh) payload.force_refresh = true;

  return payload;
}

export default function CorporateDossierDetailView({ dossier }: Props) {
  const { t, preferences } = useTranslation();
  const router = useRouter();
  const { enqueuePersonResearchJob, cancelJob, getActivePersonJob, jobs } = useDossierJobs();
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [regenerateErr, setRegenerateErr] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const meta = useMemo(() => parseDossierData(dossier.dossier_data), [dossier.dossier_data]);
  const isPersonPipeline = meta.pipeline === "person_research";

  const activeJob =
    jobs.find((j) => j.id === activeJobId) ?? (isPersonPipeline ? getActivePersonJob() : null);
  const isRegenerating =
    regenerating ||
    activeJob?.status === "queued" ||
    activeJob?.status === "running";

  useEffect(() => {
    if (!activeJobId) return;
    const job = jobs.find((j) => j.id === activeJobId);
    if (!job) return;
    if (job.status === "completed" && job.result) {
      setActiveJobId(null);
      setRegenerating(false);
      const saved = (job.result as PersonResearchApiResponse).saved_dossier?.id;
      if (saved && saved !== dossier.id) {
        router.push(`/dashboard/dossiers/${saved}`);
      } else if (saved) {
        router.refresh();
      }
    }
    if (job.status === "failed" || job.status === "cancelled") {
      setActiveJobId(null);
      setRegenerating(false);
      if (job.status === "failed" && job.error_message) {
        setRegenerateErr(job.error_message);
      }
    }
  }, [jobs, activeJobId, dossier.id, router]);
  const lushaDiagnostics = useMemo(() => {
    const dd = dossier.dossier_data;
    if (!dd || typeof dd !== "object") return null;
    const ld = (dd as Record<string, unknown>).lusha_diagnostics;
    if (!ld || typeof ld !== "object") return null;
    const o = ld as Record<string, unknown>;
    const warnings = Array.isArray(o.warnings)
      ? o.warnings.filter((w): w is string => typeof w === "string" && w.trim().length > 0)
      : [];
    const profilesCount = typeof o.profiles_count === "number" ? o.profiles_count : null;
    const urls = Array.isArray(o.profile_urls)
      ? o.profile_urls.filter((u): u is string => typeof u === "string")
      : [];
    if (profilesCount === null && warnings.length === 0 && urls.length === 0) return null;
    return { profilesCount, warnings, urls };
  }, [dossier.dossier_data]);

  const created = dossier.created_at
    ? formatLongDate(dossier.created_at, preferences)
    : "—";
  const updated = dossier.updated_at
    ? formatLongDate(dossier.updated_at, preferences)
    : "—";

  const alertsList = useMemo(() => {
    const a = dossier.alerts;
    if (Array.isArray(a)) return a;
    return [];
  }, [dossier.alerts]);

  const statusOk = dossier.status === "complete" && meta.success !== false;
  const statusFailed = dossier.status === "failed" || meta.success === false;
  const statusMsg = dossier.status_message?.trim();

  async function handleRegeneratePerson() {
    if (!isPersonPipeline || isRegenerating) return;
    setRegenerateErr(null);
    if (!getStoredAccessToken()) {
      setRegenerateErr(t("person_research.error_auth"));
      return;
    }
    const payload = buildPersonResearchPayloadFromDossier(
      dossier,
      resolveDossierOutputLanguage(preferences),
      true,
    );
    if (!payload) {
      setRegenerateErr(t("person_research.error_name"));
      return;
    }
    setRegenerating(true);
    try {
      const jobId = await enqueuePersonResearchJob(payload);
      setActiveJobId(jobId);
    } catch (e) {
      setRegenerating(false);
      setRegenerateErr(e instanceof DossierApiError ? e.message : t("generate.error.api"));
    }
  }

  async function handleCancelRegenerate() {
    if (!activeJob?.id) return;
    setRegenerateErr(null);
    try {
      await cancelJob(activeJob.id);
      setActiveJobId(null);
      setRegenerating(false);
    } catch (e) {
      setRegenerateErr(
        e instanceof DossierApiError ? e.message : t("person_research.cancel_error"),
      );
    }
  }

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm(t("dossiers.delete_confirm"))) return;
    setDeleteErr(null);
    setDeleting(true);
    try {
      await deleteDossierFromApi(dossier.id);
      router.push("/dashboard/dossiers");
      router.refresh();
    } catch (e) {
      setDeleteErr(e instanceof DossierApiError ? e.message : t("detail.delete_error"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <nav className="mb-6">
        <Link
          href="/dashboard/dossiers"
          className="inline-flex items-center gap-1.5 text-sm transition hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t("detail.back")}
        </Link>
      </nav>

      <header
        className="mb-8 flex flex-col gap-6 rounded-xl border p-6 lg:flex-row lg:items-start lg:justify-between"
        style={{
          borderColor: "var(--border-default)",
          backgroundImage:
            "linear-gradient(180deg, var(--bg-card-start) 0%, var(--bg-card-end) 100%)",
        }}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-wide"
              style={{
                borderColor: statusOk
                  ? "rgba(52,211,153,0.35)"
                  : statusFailed
                    ? "rgba(248,113,113,0.45)"
                    : "rgba(251,191,36,0.4)",
                color: statusOk
                  ? "var(--status-success)"
                  : statusFailed
                    ? "var(--status-error)"
                    : "var(--status-warning)",
              }}
            >
              {statusFailed ? t("dossiers.status_failed") : dossier.status}
            </span>
            {meta.cacheHit ? (
              <span
                className="rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-wide"
                style={{
                  borderColor: "var(--alert-info-border)",
                  color: "var(--alert-info-text)",
                  backgroundColor: "var(--alert-info-bg)",
                }}
              >
                {t("detail.cache_badge")}
              </span>
            ) : null}
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {dossier.subject_name || t("detail.api_no_subject")}
          </h1>
          <CalendarMeetingLabel
            trigger_source={dossier.trigger_source}
            calendar_meeting={dossier.calendar_meeting}
            dossier_data={dossier.dossier_data}
          />
          {dossier.subject_email && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {dossier.subject_email}
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            {t("detail.api_dates", { created, updated })}
          </p>
          {!statusOk && statusMsg ? (
            <p className="ui-text-warning text-sm" role="alert">
              {statusMsg}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 lg:items-end">
          <Link
            href={refineHrefForDossier(dossier.subject_name, meta.pipeline)}
            className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
            }}
          >
            {isPersonPipeline ? t("detail.person_refine_cta") : t("detail.refine_cta")}
          </Link>
          {isPersonPipeline ? (
            isRegenerating ? (
              <div
                className="w-full max-w-xs rounded-lg border px-4 py-3 text-sm lg:text-right"
                style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
              >
                <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {t("person_research.generating_title", {
                    name: activeJob?.meeting_label || dossier.subject_name || "",
                  })}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("person_research.generating_background")}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-red-300 hover:text-red-200"
                  onClick={() => void handleCancelRegenerate()}
                >
                  {t("person_research.cancel")}
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isRegenerating}
                  onClick={() => void handleRegeneratePerson()}
                  className="inline-flex items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
                  style={{
                    borderColor: "var(--border-default)",
                    color: "var(--accent-from)",
                  }}
                >
                  {t("person_research.regenerate")}
                </button>
                <p className="max-w-xs text-right text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {t("person_research.regenerate_hint")}
                </p>
              </>
            )
          ) : null}
          <DeleteDossierIconButton
            isDeleting={deleting}
            onClick={() => void handleDelete()}
          />
          {deleteErr && (
            <p className="max-w-xs text-right text-xs text-red-400" role="alert">
              {deleteErr}
            </p>
          )}
          {regenerateErr && (
            <p className="max-w-xs text-right text-xs text-red-400" role="alert">
              {regenerateErr}
            </p>
          )}
        </div>
      </header>

      {isPersonPipeline && lushaDiagnostics ? (
        <div
          className="mb-6 rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-muted)",
          }}
        >
          <p className="font-medium" style={{ color: "var(--text-primary)" }}>
            {t("overview.calendar_enrichment_diagnostics")}
          </p>
          <p className="mt-1">
            {lushaDiagnostics.profilesCount === 0
              ? t("detail.enrichment_no_profiles")
              : t("detail.enrichment_profiles_found", {
                  count: lushaDiagnostics.profilesCount ?? 0,
                })}
          </p>
          {lushaDiagnostics.urls.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {lushaDiagnostics.urls.map((u) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noreferrer" className="underline">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {lushaDiagnostics.warnings.length > 0 ? (
            <ul className="ui-text-warning mt-2 list-disc pl-5">
              {lushaDiagnostics.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
          <DashboardCard title={t("detail.api_report_title")}>
            {reportBodyIsPresent(meta.body) ? (
              <div
                className="api-md max-w-none text-sm leading-relaxed"
                style={{ color: "var(--text-primary)" }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{meta.body}</ReactMarkdown>
              </div>
            ) : statusMsg ? (
              <p className="text-sm text-red-300/90" role="alert">
                {statusMsg}
              </p>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("detail.api_no_body")}
              </p>
            )}
          </DashboardCard>

          {alertsList.length > 0 && (
            <DashboardCard title={t("detail.alerts")}>
              <ul className="flex flex-col gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                {alertsList.map((item, i) => (
                  <li key={i} className="rounded-lg border p-2" style={{ borderColor: "var(--border-default)" }}>
                    {typeof item === "string" ? (
                      <p className="whitespace-pre-wrap break-words">{item}</p>
                    ) : (
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs">
                        {JSON.stringify(item, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            </DashboardCard>
          )}

          <DashboardCard title={isPersonPipeline ? t("detail.person_refine_title") : t("detail.refine_title")}>
            <p className="mb-3 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {isPersonPipeline ? t("detail.person_refine_desc") : t("detail.refine_desc")}
            </p>
            {isPersonPipeline ? (
              <ul
                className="mb-4 list-inside list-disc space-y-1 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                <li>{t("detail.person_refine_bullet_name")}</li>
                <li>{t("detail.person_refine_bullet_company")}</li>
                <li>{t("detail.person_refine_bullet_geo")}</li>
              </ul>
            ) : (
              <ul
                className="mb-4 list-inside list-disc space-y-1 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                <li>{t("detail.refine_bullet_legal")}</li>
                <li>{t("detail.refine_bullet_ticker")}</li>
                <li>{t("detail.refine_bullet_country")}</li>
              </ul>
            )}
            <Link
              href={refineHrefForDossier(dossier.subject_name, meta.pipeline)}
              className="inline-flex w-full items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition hover:opacity-90"
              style={{ borderColor: "var(--border-default)", color: "var(--accent-from)" }}
            >
              {isPersonPipeline ? t("detail.person_refine_cta") : t("detail.refine_cta")}
            </Link>
            {isPersonPipeline && !isRegenerating ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleRegeneratePerson()}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
                  style={{
                    borderColor: "var(--border-default)",
                    color: "var(--accent-from)",
                  }}
                >
                  {t("person_research.regenerate")}
                </button>
                <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("person_research.regenerate_hint")}
                </p>
              </>
            ) : null}
          </DashboardCard>
      </div>

      <style jsx global>{`
        .api-md h1 {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 1.25rem 0 0.75rem;
        }
        .api-md h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 1.1rem 0 0.5rem;
        }
        .api-md h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin: 0.9rem 0 0.4rem;
        }
        .api-md p {
          margin: 0.5rem 0;
        }
        .api-md ul,
        .api-md ol {
          margin: 0.5rem 0 0.5rem 1.1rem;
          padding-left: 0.25rem;
        }
        .api-md li {
          margin: 0.25rem 0;
        }
        .api-md a {
          color: var(--accent-from);
          text-decoration: underline;
        }
        .api-md code {
          font-size: 0.85em;
          padding: 0.1em 0.35em;
          border-radius: 4px;
          background: rgba(99, 102, 241, 0.12);
        }
        .api-md pre {
          overflow-x: auto;
          padding: 0.75rem;
          border-radius: 8px;
          margin: 0.75rem 0;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
        }
        .api-md pre code {
          background: transparent;
          padding: 0;
        }
        .api-md blockquote {
          margin: 0.75rem 0;
          padding-left: 0.75rem;
          border-left: 3px solid var(--accent-from);
          color: var(--text-muted);
        }
        .api-md table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.75rem 0;
          font-size: 0.85rem;
        }
        .api-md th,
        .api-md td {
          border: 1px solid var(--border-default);
          padding: 0.35rem 0.5rem;
        }
        .api-md th {
          background: var(--bg-surface);
        }
      `}</style>
    </>
  );
}
