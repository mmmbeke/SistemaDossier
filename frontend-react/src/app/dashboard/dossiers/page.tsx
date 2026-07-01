"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import FilterTabs, { type FilterValue } from "@/components/dossier/FilterTabs";
import CalendarMeetingLabel from "@/components/dossier/CalendarMeetingLabel";
import DossierFolderCard from "@/components/dossier/DossierFolderCard";
import TopBar from "@/components/dashboard/TopBar";
import NewDossierButton from "@/components/dossier/NewDossierButton";
import UiAlert from "@/components/ui/UiAlert";
import {
  DossierApiError,
  deleteDossierFromApi,
  fetchDossiersFromApi,
  getStoredAccessToken,
  isDossierFolderEntry,
  type DossierListEntry,
  type DossierListItem,
} from "@/lib/dossier-api";
import { countListEntries, entryMatchesFilter, entryMatchesQuery } from "@/lib/dossier-list-utils";
import { useTranslation } from "@/providers/PreferencesProvider";

type DbLoadState = "idle" | "loading" | "ready" | "error";

export default function DossiersPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [dbLoad, setDbLoad] = useState<DbLoadState>("idle");
  const [dbItems, setDbItems] = useState<DossierListEntry[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!getStoredAccessToken()) {
        setDbLoad("idle");
        setDbItems([]);
        setDbError(null);
        return;
      }
      setDbLoad("loading");
      setDbError(null);
      void fetchDossiersFromApi(100)
        .then((res) => {
          if (cancelled) return;
          setDbItems(res.items);
          setDbLoad("ready");
        })
        .catch((e) => {
          if (cancelled) return;
          setDbLoad("error");
          setDbError(e instanceof DossierApiError ? e.message : String(e));
          setDbItems([]);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDb = useMemo(() => {
    return dbItems.filter(
      (entry) => entryMatchesQuery(entry, query) && entryMatchesFilter(entry, filter)
    );
  }, [dbItems, query, filter]);

  const useLiveDb = dbLoad === "ready";
  const hasSession = Boolean(getStoredAccessToken());
  const counts = useMemo(() => countListEntries(dbItems), [dbItems]);
  const filterAllLabel = t("dossiers.filter_all").replace(/\s*\(\d+\)/, ` (${counts.all})`);

  async function handleDeleteDossier(row: DossierListItem) {
    if (deletingId) return;
    if (!window.confirm(t("dossiers.delete_confirm"))) return;
    setDeletingId(row.id);
    setDbError(null);
    try {
      await deleteDossierFromApi(row.id);
      setDbItems((prev) =>
        prev
          .map((entry) => {
            if (isDossierFolderEntry(entry)) {
              const dossiers = entry.dossiers.filter((d) => d.id !== row.id);
              if (dossiers.length === 0) return null;
              return { ...entry, dossiers };
            }
            if (entry.id === row.id) return null;
            return entry;
          })
          .filter((e): e is DossierListEntry => e !== null)
      );
    } catch (e) {
      setDbError(e instanceof DossierApiError ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <TopBar
        title={t("dossiers.title")}
        subtitle={t("dossiers.subtitle")}
        action={<NewDossierButton />}
      />

      {dbLoad === "loading" && (
        <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
          {t("dossiers.database_loading")}
        </p>
      )}

      {dbLoad === "error" && dbError && (
        <UiAlert variant="warning" className="mb-4" role="alert">
          {t("dossiers.database_error")}: {dbError}
        </UiAlert>
      )}

      {!hasSession && (
        <div
          className="mb-6 rounded-xl border px-4 py-4 text-sm"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-muted)",
          }}
        >
          <p className="mb-2" style={{ color: "var(--text-primary)" }}>
            {t("dossiers.login_required")}
          </p>
          <Link
            href="/login"
            className="font-medium underline"
            style={{ color: "var(--accent-from)" }}
          >
            {t("dossiers.login_required_cta")}
          </Link>
        </div>
      )}

      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="flex h-11 flex-1 items-center gap-2 rounded-lg border px-3.5"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-input)",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4"
            style={{ color: "var(--text-subtle)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t("dossiers.search_short")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs"
              style={{ color: "var(--text-subtle)" }}
            >
              {t("common.clear")}
            </button>
          )}
        </div>

        <FilterTabs
          active={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: filterAllLabel, count: counts.all },
            { value: "complete", label: t("dossiers.filter_complete"), count: counts.complete },
            {
              value: "needs_update",
              label: t("dossiers.filter_needs_update"),
              count: counts.needs_update,
            },
          ]}
        />
      </section>

      {useLiveDb && (
        <section className="mb-10">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--accent-from)",
                border: "1px solid var(--border-default)",
              }}
            >
              {t("dossiers.database_badge")}
            </span>
          </div>

          {filteredDb.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-xl border px-6 py-12 text-center"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {dbItems.length === 0
                  ? t("dossiers.database_empty")
                  : t("dossiers.no_results_hint")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDb.map((entry) =>
                isDossierFolderEntry(entry) ? (
                  <DossierFolderCard
                    key={entry.id}
                    folder={entry}
                    deletingId={deletingId}
                    onDeleteDossier={handleDeleteDossier}
                  />
                ) : (
                  <div
                    key={entry.id}
                    className="flex gap-1 rounded-xl border transition hover:border-strong"
                    style={{
                      borderColor: "var(--border-default)",
                      backgroundColor: "var(--bg-surface)",
                    }}
                  >
                    <Link
                      href={`/dashboard/dossiers/${entry.id}`}
                      className="flex min-w-0 flex-1 flex-col gap-2 p-4 text-left"
                    >
                      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {entry.subject_name || entry.subject_email || "—"}
                      </span>
                      <CalendarMeetingLabel
                        trigger_source={entry.trigger_source}
                        calendar_meeting={entry.calendar_meeting}
                        dossier_data={entry.dossier_data}
                        compact
                      />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {entry.subject_email || "—"} · {entry.status} · {entry.depth_level}
                      </span>
                      {entry.created_at && (
                        <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
                          {entry.created_at.slice(0, 10)}
                        </span>
                      )}
                    </Link>
                    <button
                      type="button"
                      disabled={deletingId === entry.id}
                      onClick={() => void handleDeleteDossier(entry)}
                      className="shrink-0 self-stretch rounded-r-xl px-3 text-xs font-medium transition hover:bg-red-500/15 disabled:opacity-50"
                      style={{ color: "var(--text-muted)" }}
                      title={t("dossiers.delete_aria")}
                      aria-label={t("dossiers.delete_aria")}
                    >
                      {deletingId === entry.id ? t("dossiers.deleting") : t("dossiers.delete")}
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
