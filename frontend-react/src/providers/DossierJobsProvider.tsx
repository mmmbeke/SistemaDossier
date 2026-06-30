"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  DossierApiError,
  fetchDossierGenerationJob,
  fetchDossierGenerationJobs,
  fetchEnqueueGoogleCalendarDossier,
  fetchEnqueueOutlookCalendarDossier,
  type CalendarProvider,
  type DossierGenerationJobApi,
  type DossierGenerationJobStatus,
  type OutlookReunionApi,
} from "@/lib/dossier-api";
import { resolveDossierOutputLanguage } from "@/lib/resolve-output-language";
import { usePreferences, useTranslation } from "@/providers/PreferencesProvider";

const STORAGE_KEY = "dossier_active_job_ids";
const POLL_MS = 3000;
const TERMINAL: DossierGenerationJobStatus[] = ["completed", "failed"];

type TrackedJob = DossierGenerationJobApi & {
  toastDismissed?: boolean;
};

type DossierJobsContextValue = {
  jobs: TrackedJob[];
  enqueueCalendarJob: (
    provider: CalendarProvider,
    options: { eventId: string; reunion?: OutlookReunionApi },
  ) => Promise<string>;
  isEventGenerating: (eventId: string | undefined | null) => boolean;
  getJobForEvent: (eventId: string | undefined | null) => TrackedJob | undefined;
  dismissToast: (jobId: string) => void;
};

const DossierJobsContext = createContext<DossierJobsContextValue | null>(null);

function loadStoredJobIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveStoredJobIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function folderHref(job: TrackedJob): string | null {
  const folderId = job.result?.saved_dossiers?.folder?.id;
  if (folderId) return `/dashboard/dossiers/folder/${folderId}`;
  const corpId = job.result?.saved_dossiers?.corporate?.id;
  if (corpId) return `/dashboard/dossiers/${corpId}`;
  const personId = job.result?.saved_dossiers?.person?.id;
  if (personId) return `/dashboard/dossiers/${personId}`;
  return "/dashboard/dossiers";
}

export function DossierJobsProvider({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences();
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const mergeJob = useCallback((incoming: DossierGenerationJobApi) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === incoming.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...incoming };
        return next;
      }
      return [...prev, incoming];
    });
  }, []);

  const syncActiveIds = useCallback((list: TrackedJob[]) => {
    const active = list
      .filter((j) => !TERMINAL.includes(j.status))
      .map((j) => j.id);
    saveStoredJobIds(active);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const { jobs: activeFromApi } = await fetchDossierGenerationJobs({ activeOnly: true });
        if (cancelled) return;
        const stored = loadStoredJobIds();
        const byId = new Map<string, DossierGenerationJobApi>();
        for (const j of activeFromApi) byId.set(j.id, j);
        for (const id of stored) {
          if (!byId.has(id)) {
            try {
              byId.set(id, await fetchDossierGenerationJob(id));
            } catch {
              /* job expired or 404 */
            }
          }
        }
        const merged = Array.from(byId.values());
        setJobs(merged);
        syncActiveIds(merged);
      } catch {
        /* sin sesión o API caída */
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [syncActiveIds]);

  useEffect(() => {
    const hasActive = jobs.some((j) => !TERMINAL.includes(j.status));
    if (!hasActive) return;

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const active = jobsRef.current.filter((j) => !TERMINAL.includes(j.status));
          if (active.length === 0) return;
          for (const j of active) {
            const fresh = await fetchDossierGenerationJob(j.id);
            mergeJob(fresh);
          }
          syncActiveIds(jobsRef.current);
        } catch {
          /* polling silencioso */
        }
      })();
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [jobs, mergeJob, syncActiveIds]);

  const enqueueCalendarJob = useCallback(
    async (
      provider: CalendarProvider,
      options: { eventId: string; reunion?: OutlookReunionApi },
    ): Promise<string> => {
      const enqueue =
        provider === "google"
          ? fetchEnqueueGoogleCalendarDossier
          : fetchEnqueueOutlookCalendarDossier;
      const res = await enqueue({
        eventId: options.eventId,
        reunion: options.reunion,
        output_language: resolveDossierOutputLanguage(preferences),
      });
      if (!res.job_id) {
        throw new DossierApiError(502, "La API no devolvió job_id.");
      }
      const job: TrackedJob = {
        id: res.job_id,
        status: res.status ?? "queued",
        job_type: "calendar_manual",
        calendar_provider: provider === "google" ? "google" : "microsoft",
        external_event_id: options.eventId,
        meeting_label: res.meeting_label ?? options.reunion?.tema ?? null,
        credits_estimated: res.credits_estimated ?? 0,
        credits_consumed: 0,
      };
      setJobs((prev) => {
        const next = [...prev.filter((j) => j.id !== job.id), job];
        syncActiveIds(next);
        return next;
      });
      return res.job_id;
    },
    [mergeJob, preferences, syncActiveIds],
  );

  const isEventGenerating = useCallback(
    (eventId: string | undefined | null) => {
      if (!eventId) return false;
      return jobs.some(
        (j) =>
          j.external_event_id === eventId &&
          (j.status === "queued" || j.status === "running"),
      );
    },
    [jobs],
  );

  const getJobForEvent = useCallback(
    (eventId: string | undefined | null) => {
      if (!eventId) return undefined;
      return jobs.find((j) => j.external_event_id === eventId);
    },
    [jobs],
  );

  const dismissToast = useCallback((jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, toastDismissed: true } : j)),
    );
  }, []);

  const value = useMemo(
    () => ({
      jobs,
      enqueueCalendarJob,
      isEventGenerating,
      getJobForEvent,
      dismissToast,
    }),
    [jobs, enqueueCalendarJob, isEventGenerating, getJobForEvent, dismissToast],
  );

  return (
    <DossierJobsContext.Provider value={value}>
      {children}
      <DossierJobToasts jobs={jobs} onDismiss={dismissToast} folderHref={folderHref} />
    </DossierJobsContext.Provider>
  );
}

function DossierJobToasts({
  jobs,
  onDismiss,
  folderHref,
}: {
  jobs: TrackedJob[];
  onDismiss: (jobId: string) => void;
  folderHref: (job: TrackedJob) => string | null;
}) {
  const { t } = useTranslation();
  const visible = jobs.filter(
    (j) =>
      !j.toastDismissed &&
      (j.status === "queued" ||
        j.status === "running" ||
        j.status === "completed" ||
        j.status === "failed"),
  );

  if (visible.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {visible.map((job) => {
        const label = job.meeting_label || t("dossier_jobs.default_label");
        const href = folderHref(job);
        const isActive = job.status === "queued" || job.status === "running";
        const isOk = job.status === "completed";
        const isFail = job.status === "failed";

        return (
          <div
            key={job.id}
            className="rounded-lg border px-4 py-3 shadow-lg"
            style={{
              borderColor: "var(--border-default)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{label}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {isActive && t("dossier_jobs.generating")}
                  {isOk && t("dossier_jobs.ready")}
                  {isFail && (job.error_message || t("dossier_jobs.failed"))}
                </p>
                {isOk && job.result?.dossier_persona_research?.warnings?.length ? (
                  <p className="mt-1 text-xs text-amber-200/90 line-clamp-3">
                    {job.result.dossier_persona_research.warnings[0]}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 text-xs opacity-60 hover:opacity-100"
                onClick={() => onDismiss(job.id)}
                aria-label={t("dossier_jobs.dismiss")}
              >
                ×
              </button>
            </div>
            {isOk && href && (
              <Link
                href={href}
                className="mt-2 inline-block text-xs font-medium underline"
                onClick={() => onDismiss(job.id)}
              >
                {t("dossier_jobs.view_folder")}
              </Link>
            )}
            {isActive && (
              <div
                className="mt-2 h-1 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--border-default)" }}
              >
                <div
                  className="h-full w-1/3 animate-pulse rounded-full"
                  style={{ backgroundColor: "var(--accent-primary, #6366f1)" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function useDossierJobs(): DossierJobsContextValue {
  const ctx = useContext(DossierJobsContext);
  if (!ctx) {
    throw new Error("useDossierJobs debe usarse dentro de DossierJobsProvider");
  }
  return ctx;
}
