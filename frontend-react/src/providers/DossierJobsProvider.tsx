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
  cancelDossierGenerationJob,
  enqueuePersonResearch,
  fetchDossierGenerationJob,
  fetchDossierGenerationJobs,
  fetchEnqueueGoogleCalendarDossier,
  fetchEnqueueOutlookCalendarDossier,
  type CalendarProvider,
  type CalendarGenerarDossierItem,
  type DossierGenerationJobApi,
  type DossierGenerationJobStatus,
  type OutlookReunionApi,
  type PersonResearchPayload,
  type PersonResearchApiResponse,
} from "@/lib/dossier-api";
import { resolveDossierOutputLanguage } from "@/lib/resolve-output-language";
import { usePreferences, useTranslation } from "@/providers/PreferencesProvider";

const STORAGE_KEY = "dossier_active_job_ids";
const TOAST_JOB_IDS_KEY = "dossier_toast_job_ids";
const POLL_MS = 3000;
const TERMINAL: DossierGenerationJobStatus[] = ["completed", "failed", "cancelled"];

type TrackedJob = DossierGenerationJobApi & {
  toastDismissed?: boolean;
};

type DossierJobsContextValue = {
  jobs: TrackedJob[];
  enqueueCalendarJob: (
    provider: CalendarProvider,
    options: { eventId: string; reunion?: OutlookReunionApi },
  ) => Promise<string>;
  enqueuePersonResearchJob: (payload: PersonResearchPayload) => Promise<string>;
  cancelJob: (jobId: string) => Promise<void>;
  isEventGenerating: (eventId: string | undefined | null) => boolean;
  getJobForEvent: (eventId: string | undefined | null) => TrackedJob | undefined;
  getActivePersonJob: () => TrackedJob | undefined;
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

function loadToastJobIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(TOAST_JOB_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveToastJobIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TOAST_JOB_IDS_KEY, JSON.stringify(ids.slice(0, 12)));
  } catch {
    /* ignore */
  }
}

function calendarJobHasPartialFailure(job: TrackedJob): boolean {
  if (job.job_type !== "calendar_manual" || job.status !== "completed" || !job.result) {
    return false;
  }
  const cal = job.result as CalendarGenerarDossierItem;
  const saved = cal.saved_dossiers;
  if (!saved) return false;
  const corpFailed = saved.corporate?.status === "failed";
  const personFailed = saved.person?.status === "failed";
  const corpOk = saved.corporate?.status === "complete";
  const personOk = saved.person?.status === "complete";
  return (corpFailed || personFailed) && (corpOk || personOk);
}

function calendarJobSavedNothing(job: TrackedJob): boolean {
  if (job.job_type !== "calendar_manual" || job.status !== "completed" || !job.result) {
    return false;
  }
  const saved = (job.result as CalendarGenerarDossierItem).saved_dossiers;
  return !saved?.corporate && !saved?.person;
}

function dossierHref(job: TrackedJob): string | null {
  if (job.job_type === "person_manual" && job.result) {
    const personResult = job.result as PersonResearchApiResponse;
    const personManualId = personResult.saved_dossier?.id;
    if (personManualId) return `/dashboard/dossiers/${personManualId}`;
    return "/dashboard/dossiers";
  }
  if (job.job_type === "calendar_manual" && job.result) {
    const cal = job.result as CalendarGenerarDossierItem;
    const folderId = cal.saved_dossiers?.folder?.id;
    if (folderId) return `/dashboard/dossiers/folder/${folderId}`;
    const personFromCalendar = cal.saved_dossiers?.person?.id;
    if (personFromCalendar) return `/dashboard/dossiers/${personFromCalendar}`;
    const corpId = cal.saved_dossiers?.corporate?.id;
    if (corpId) return `/dashboard/dossiers/${corpId}`;
  }
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
    const toastIds = list
      .filter((j) => TERMINAL.includes(j.status) && !j.toastDismissed)
      .map((j) => j.id);
    saveToastJobIds(toastIds);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const { jobs: activeFromApi } = await fetchDossierGenerationJobs({ activeOnly: true });
        if (cancelled) return;
        const stored = loadStoredJobIds();
        const toastStored = loadToastJobIds();
        const byId = new Map<string, DossierGenerationJobApi>();
        for (const j of activeFromApi) byId.set(j.id, j);
        for (const id of [...stored, ...toastStored]) {
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

  const enqueuePersonResearchJob = useCallback(
    async (payload: PersonResearchPayload): Promise<string> => {
      const res = await enqueuePersonResearch(payload);
      if (!res.job_id) {
        throw new DossierApiError(502, "La API no devolvió job_id.");
      }
      const job: TrackedJob = {
        id: res.job_id,
        status: res.status ?? "queued",
        job_type: "person_manual",
        calendar_provider: null,
        external_event_id: null,
        meeting_label: res.meeting_label ?? payload.full_name ?? null,
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
    [syncActiveIds],
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      const updated = await cancelDossierGenerationJob(jobId);
      setJobs((prev) => {
        const next = prev.map((j) => (j.id === jobId ? { ...j, ...updated } : j));
        syncActiveIds(next);
        return next;
      });
    },
    [syncActiveIds],
  );

  const getActivePersonJob = useCallback(() => {
    return jobs.find(
      (j) =>
        j.job_type === "person_manual" &&
        (j.status === "queued" || j.status === "running"),
    );
  }, [jobs]);

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
    setJobs((prev) => {
      const next = prev.map((j) => (j.id === jobId ? { ...j, toastDismissed: true } : j));
      syncActiveIds(next);
      return next;
    });
  }, [syncActiveIds]);

  const value = useMemo(
    () => ({
      jobs,
      enqueueCalendarJob,
      enqueuePersonResearchJob,
      cancelJob,
      isEventGenerating,
      getJobForEvent,
      getActivePersonJob,
      dismissToast,
    }),
    [
      jobs,
      enqueueCalendarJob,
      enqueuePersonResearchJob,
      cancelJob,
      isEventGenerating,
      getJobForEvent,
      getActivePersonJob,
      dismissToast,
    ],
  );

  return (
    <DossierJobsContext.Provider value={value}>
      {children}
      <DossierJobToasts
        jobs={jobs}
        onDismiss={dismissToast}
        onCancel={cancelJob}
        dossierHref={dossierHref}
      />
    </DossierJobsContext.Provider>
  );
}

function DossierJobToasts({
  jobs,
  onDismiss,
  onCancel,
  dossierHref,
}: {
  jobs: TrackedJob[];
  onDismiss: (jobId: string) => void;
  onCancel: (jobId: string) => Promise<void>;
  dossierHref: (job: TrackedJob) => string | null;
}) {
  const { t } = useTranslation();
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const visible = jobs.filter(
    (j) =>
      !j.toastDismissed &&
      (j.status === "queued" ||
        j.status === "running" ||
        j.status === "completed" ||
        j.status === "failed" ||
        j.status === "cancelled"),
  );

  if (visible.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {visible.map((job) => {
        const label =
          job.meeting_label ||
          (job.job_type === "person_manual"
            ? t("dossier_jobs.person_label")
            : t("dossier_jobs.default_label"));
        const href = dossierHref(job);
        const isActive = job.status === "queued" || job.status === "running";
        const isFail =
          job.status === "failed" ||
          calendarJobSavedNothing(job);
        const isPartial = !isFail && calendarJobHasPartialFailure(job);
        const isOk = job.status === "completed" && !isFail && !isPartial;
        const isCancelled = job.status === "cancelled";
        const calendarWarning =
          isOk && job.job_type === "calendar_manual" && job.result
            ? (job.result as CalendarGenerarDossierItem).dossier_persona_research?.warnings?.[0]
            : undefined;

        return (
          <div
            key={job.id}
            className="rounded-lg border px-4 py-3 shadow-xl"
            style={{
              borderColor: "var(--border-strong)",
              backgroundColor: "var(--bg-panel)",
              color: "var(--text-primary)",
              boxShadow: "0 12px 32px rgba(10, 20, 40, 0.2)",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{label}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {isActive && t("dossier_jobs.generating")}
                  {isOk && t("dossier_jobs.ready")}
                  {isPartial && t("dossier_jobs.partial")}
                  {isFail && (job.error_message || t("dossier_jobs.failed"))}
                  {isCancelled && t("dossier_jobs.cancelled")}
                </p>
                {calendarWarning ? (
                  <p className="mt-1 text-xs ui-text-warning line-clamp-3">
                    {calendarWarning}
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
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {(isOk || isPartial) && href && (
                <Link
                  href={href}
                  className="inline-block text-xs font-medium underline"
                  onClick={() => onDismiss(job.id)}
                >
                  {job.job_type === "person_manual"
                    ? t("dossier_jobs.view_dossier")
                    : t("dossier_jobs.view_folder")}
                </Link>
              )}
              {isActive && (
                <button
                  type="button"
                  className="text-xs font-medium transition hover:opacity-80"
                  style={{ color: "var(--alert-error-text)" }}
                  onClick={() => {
                    setCancelErr(null);
                    void onCancel(job.id).catch((e) => {
                      setCancelErr(
                        e instanceof DossierApiError ? e.message : t("dossier_jobs.failed"),
                      );
                    });
                  }}
                >
                  {t("dossier_jobs.cancel")}
                </button>
              )}
            </div>
            {cancelErr ? (
              <p className="mt-1 text-xs text-red-400" role="alert">
                {cancelErr}
              </p>
            ) : null}
            {isActive && (
              <div
                className="mt-2 h-1 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--border-default)" }}
              >
                <div
                  className="h-full w-1/3 animate-pulse rounded-full"
                  style={{ backgroundColor: "var(--accent-primary)" }}
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
