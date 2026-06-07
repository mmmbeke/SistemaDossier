"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DashboardCard from "@/components/dashboard/DashboardCard";
import { DossierApiError, deleteDossierFromApi, type DossierDetailResponse } from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";
import { formatLongDate } from "@/lib/format";

type Props = {
  dossier: DossierDetailResponse;
};

const KNOWN_DOSSIER_DATA_KEYS = new Set([
  "body",
  "format",
  "pipeline",
  "depth_requested",
  "success",
  "billing",
  "resolution",
  "person_filters",
]);

function formatExtraValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function parseDossierData(data: unknown): {
  body: string;
  format: string | null;
  pipeline: string | null;
  depthRequested: string | null;
  success: boolean | null;
  billing: string | null;
  extraRows: { key: string; value: string }[];
} {
  if (!data || typeof data !== "object") {
    return {
      body: "",
      format: null,
      pipeline: null,
      depthRequested: null,
      success: null,
      billing: null,
      extraRows: [],
    };
  }
  const o = data as Record<string, unknown>;
  const body = typeof o.body === "string" ? o.body : "";
  const extraRows: { key: string; value: string }[] = [];
  for (const [key, val] of Object.entries(o)) {
    if (KNOWN_DOSSIER_DATA_KEYS.has(key)) continue;
    const value = formatExtraValue(val);
    if (value) extraRows.push({ key, value });
  }
  extraRows.sort((a, b) => a.key.localeCompare(b.key));
  return {
    body,
    format: typeof o.format === "string" ? o.format : null,
    pipeline: typeof o.pipeline === "string" ? o.pipeline : null,
    depthRequested: typeof o.depth_requested === "string" ? o.depth_requested : null,
    success: typeof o.success === "boolean" ? o.success : null,
    billing: typeof o.billing === "string" ? o.billing : null,
    extraRows,
  };
}

function refineHrefForDossier(subject: string | null, pipeline: string | null): string {
  if (pipeline === "person_research") {
    return "/dashboard/person-research";
  }
  const q = (subject ?? "").trim();
  const base = "/dashboard/generate";
  if (!q) return base;
  return `${base}?q=${encodeURIComponent(q)}&pick=1`;
}

export default function CorporateDossierDetailView({ dossier }: Props) {
  const { t, preferences } = useTranslation();
  const router = useRouter();
  const [showRaw, setShowRaw] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const meta = useMemo(() => parseDossierData(dossier.dossier_data), [dossier.dossier_data]);
  const isPersonPipeline = meta.pipeline === "person_research";

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

  const agentsOk = dossier.agents_activated ?? [];
  const agentsFail = dossier.agents_failed ?? [];
  const sources = dossier.data_sources_used ?? [];
  const genMs = dossier.generation_duration_ms;
  const statusMsg = dossier.status_message?.trim();

  const hasPipelineCard =
    agentsOk.length > 0 ||
    agentsFail.length > 0 ||
    sources.length > 0 ||
    (typeof genMs === "number" && genMs >= 0) ||
    Boolean(statusMsg);

  const statusOk = dossier.status === "complete" && meta.success !== false;

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
                borderColor: statusOk ? "rgba(52,211,153,0.35)" : "rgba(251,191,36,0.4)",
                color: statusOk ? "#34d399" : "#fbbf24",
              }}
            >
              {dossier.status}
            </span>
            {meta.pipeline && (
              <span
                className="rounded-full border px-3 py-0.5 text-xs"
                style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
              >
                {isPersonPipeline ? t("detail.pipeline_person") : meta.pipeline}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {dossier.subject_name || t("detail.api_no_subject")}
          </h1>
          {dossier.subject_email && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {dossier.subject_email}
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            {t("detail.api_dates", { created, updated })}
          </p>
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
          <button
            type="button"
            disabled={deleting}
            onClick={() => void handleDelete()}
            className="inline-flex items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium transition hover:bg-red-500/10 disabled:opacity-50"
            style={{
              borderColor: "rgba(248,113,113,0.45)",
              color: "var(--text-muted)",
            }}
          >
            {deleting ? t("dossiers.deleting") : t("detail.delete")}
          </button>
          {deleteErr && (
            <p className="max-w-xs text-right text-xs text-red-400" role="alert">
              {deleteErr}
            </p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DashboardCard title={t("detail.api_report_title")}>
            {meta.body.trim() ? (
              <div
                className="api-md max-w-none text-sm leading-relaxed"
                style={{ color: "var(--text-primary)" }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{meta.body}</ReactMarkdown>
              </div>
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

          {meta.extraRows.length > 0 && (
            <DashboardCard title={t("detail.api_extra_payload")}>
              <dl className="flex flex-col gap-3 text-sm">
                {meta.extraRows.map((row) => (
                  <div key={row.key}>
                    <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                      {row.key}
                    </dt>
                    <dd
                      className="mt-0.5 whitespace-pre-wrap break-words font-mono text-xs"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </DashboardCard>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <DashboardCard title={t("detail.api_meta_title")}>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                  {t("generate.depth_label")}
                </dt>
                <dd style={{ color: "var(--text-primary)" }}>{dossier.depth_level}</dd>
              </div>
              {meta.depthRequested && (
                <div>
                  <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                    {t("detail.api_depth_requested")}
                  </dt>
                  <dd style={{ color: "var(--text-primary)" }}>{meta.depthRequested}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                  {t("detail.api_credits")}
                </dt>
                <dd style={{ color: "var(--text-primary)" }}>{dossier.credits_consumed}</dd>
              </div>
              {meta.billing && (
                <div>
                  <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                    {t("detail.api_billing")}
                  </dt>
                  <dd style={{ color: "var(--text-primary)" }}>{meta.billing}</dd>
                </div>
              )}
              {meta.format && (
                <div>
                  <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                    {t("detail.api_format")}
                  </dt>
                  <dd style={{ color: "var(--text-primary)" }}>{meta.format}</dd>
                </div>
              )}
              {meta.success !== null && (
                <div>
                  <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                    {t("detail.api_success")}
                  </dt>
                  <dd style={{ color: "var(--text-primary)" }}>
                    {meta.success ? t("detail.api_success_yes") : t("detail.api_success_no")}
                  </dd>
                </div>
              )}
            </dl>
          </DashboardCard>

          {hasPipelineCard && (
            <DashboardCard title={t("detail.api_pipeline_sources")}>
              <div className="flex flex-col gap-4 text-sm">
                {statusMsg && (
                  <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                      {t("detail.api_status_message")}
                    </p>
                    <p className="mt-1 leading-relaxed" style={{ color: "var(--text-primary)" }}>
                      {statusMsg}
                    </p>
                  </div>
                )}
                {typeof genMs === "number" && genMs >= 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                      {t("detail.api_duration_ms")}
                    </p>
                    <p className="mt-1 tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {genMs.toLocaleString()}
                    </p>
                  </div>
                )}
                {agentsOk.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                      {t("detail.api_agents")}
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {agentsOk.map((a) => (
                        <li
                          key={a}
                          className="rounded-md border px-2 py-0.5 text-xs"
                          style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
                        >
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {agentsFail.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: "#fbbf24" }}>
                      {t("detail.api_agents_failed")}
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {agentsFail.map((a) => (
                        <li
                          key={a}
                          className="rounded-md border px-2 py-0.5 text-xs"
                          style={{ borderColor: "rgba(251,191,36,0.35)", color: "#fbbf24" }}
                        >
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {sources.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                      {t("detail.api_sources")}
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {sources.map((s) => (
                        <li
                          key={s}
                          className="rounded-md border px-2 py-0.5 text-xs"
                          style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
                        >
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
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
          </DashboardCard>

          <div>
            <button
              type="button"
              className="text-xs font-medium underline"
              style={{ color: "var(--text-muted)" }}
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? t("detail.hide_raw_json") : t("detail.show_raw_json")}
            </button>
            {showRaw && (
              <pre
                className="mt-2 max-h-80 overflow-auto rounded-lg border p-3 text-[11px]"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-muted)",
                }}
              >
                {JSON.stringify(dossier, null, 2)}
              </pre>
            )}
          </div>
        </div>
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
