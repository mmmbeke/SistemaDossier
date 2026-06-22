"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DashboardCard from "@/components/dashboard/DashboardCard";
import CalendarMeetingLabel from "@/components/dossier/CalendarMeetingLabel";
import { DossierApiError, deleteDossierFromApi, type DossierDetailResponse } from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";
import { formatLongDate } from "@/lib/format";

type Props = {
  dossier: DossierDetailResponse;
};


function parseDossierData(data: unknown): {
  body: string;
  pipeline: string | null;
  success: boolean | null;
} {
  if (!data || typeof data !== "object") {
    return {
      body: "",
      pipeline: null,
      success: null,
    };
  }
  const o = data as Record<string, unknown>;
  return {
    body: typeof o.body === "string" ? o.body : "",
    pipeline: typeof o.pipeline === "string" ? o.pipeline : null,
    success: typeof o.success === "boolean" ? o.success : null,
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

  const statusOk = dossier.status === "complete" && meta.success !== false;
  const statusMsg = dossier.status_message?.trim();

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
            <p className="text-sm text-amber-200/90" role="alert">
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

      <div className="flex flex-col gap-6">
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
