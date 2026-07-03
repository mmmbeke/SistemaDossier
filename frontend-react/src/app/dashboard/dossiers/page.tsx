"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import TopBar from "@/components/dashboard/TopBar";
import FilterTabs, { type FilterValue } from "@/components/dossier/FilterTabs";
import DossierGroupedList from "@/components/dossier/DossierGroupedList";
import DossierViewTabs from "@/components/dossier/DossierViewTabs";
import NewDossierButton from "@/components/dossier/NewDossierButton";
import UiAlert from "@/components/ui/UiAlert";
import { useAuthMe } from "@/hooks/useAuthMe";
import {
  DossierApiError,
  deleteDossierFromApi,
  fetchDossiersFromApi,
  getStoredAccessToken,
  type DossierListEntry,
  type DossierListItem,
} from "@/lib/dossier-api";
import {
  countListEntries,
  countEntriesByViewMode,
  entryMatchesFilter,
  entryMatchesQuery,
  entryMatchesTypeFilter,
  entryMatchesViewMode,
  groupListEntriesByMeetingTime,
  isNonEmptyListEntry,
  removeDossierFromListEntries,
  sortListEntriesByDate,
  type DossierViewMode,
  type TypeFilterValue,
} from "@/lib/dossier-list-utils";
import { useTranslation } from "@/providers/PreferencesProvider";

type DbLoadState = "idle" | "loading" | "ready" | "error";

export default function DossiersPage() {
  const { t } = useTranslation();
  const { canMutate, isViewer } = useAuthMe();
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<DossierViewMode>("meeting_folders");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>("all");
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

  const nonEmptyItems = useMemo(
    () => dbItems.filter(isNonEmptyListEntry),
    [dbItems]
  );

  const viewCounts = useMemo(() => countEntriesByViewMode(nonEmptyItems), [nonEmptyItems]);

  const counts = useMemo(() => {
    const scoped = nonEmptyItems.filter((entry) => entryMatchesViewMode(entry, viewMode));
    return countListEntries(scoped);
  }, [nonEmptyItems, viewMode]);

  const filteredDb = useMemo(() => {
    return dbItems.filter(
      (entry) =>
        isNonEmptyListEntry(entry) &&
        entryMatchesViewMode(entry, viewMode) &&
        entryMatchesQuery(entry, query) &&
        entryMatchesFilter(entry, filter) &&
        entryMatchesTypeFilter(entry, typeFilter)
    );
  }, [dbItems, viewMode, query, filter, typeFilter]);

  const groupedDb = useMemo(() => groupListEntriesByMeetingTime(filteredDb), [filteredDb]);
  const sortedFlatDb = useMemo(() => sortListEntriesByDate(filteredDb), [filteredDb]);

  const useLiveDb = dbLoad === "ready";
  const hasSession = Boolean(getStoredAccessToken());
  const filterAllLabel = t("dossiers.filter_all").replace(/\s*\(\d+\)/, "");

  async function handleDeleteDossier(row: DossierListItem) {
    if (deletingId) return;
    if (!window.confirm(t("dossiers.delete_confirm"))) return;
    setDeletingId(row.id);
    setDbError(null);
    try {
      await deleteDossierFromApi(row.id);
      setDbItems((prev) => removeDossierFromListEntries(prev, row.id));
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
        action={canMutate ? <NewDossierButton /> : undefined}
      />

      {isViewer && hasSession && (
        <UiAlert variant="info" className="mb-4">
          {t("dossiers.viewer_list_hint")}
        </UiAlert>
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

      <DashboardCard className="mb-6 !p-4 sm:!p-5">
        <div className="flex flex-col gap-4">
          <div
            className="flex h-11 items-center gap-2 rounded-lg border px-3.5"
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
              className="h-4 w-4 shrink-0"
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
                className="shrink-0 text-xs"
                style={{ color: "var(--text-subtle)" }}
              >
                {t("common.clear")}
              </button>
            )}
          </div>

          <DossierViewTabs
            active={viewMode}
            onChange={setViewMode}
            tabs={[
              {
                value: "meeting_folders",
                label: t("dossiers.view_meeting_folders"),
                count: viewCounts.meeting_folders,
              },
              {
                value: "standalone",
                label: t("dossiers.view_standalone"),
                count: viewCounts.standalone,
              },
            ]}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <FilterTabs
                active={filter}
                onChange={setFilter}
                tabs={[
                  { value: "all", label: filterAllLabel, count: counts.all },
                  { value: "active", label: t("dossiers.filter_active"), count: counts.active },
                  { value: "past", label: t("dossiers.filter_past"), count: counts.past },
                  {
                    value: "needs_update",
                    label: t("dossiers.filter_needs_update"),
                    count: counts.needs_update,
                  },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium shrink-0" style={{ color: "var(--text-muted)" }}>
                {t("dossiers.filter_type_label")}
              </span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilterValue)}
                className="h-9 rounded-lg border px-2.5 text-sm outline-none"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-input)",
                  color: "var(--text-primary)",
                }}
                aria-label={t("dossiers.filter_type_label")}
              >
                <option value="all">{t("dossiers.filter_type_all")}</option>
                <option value="person">{t("dossiers.filter_type_person")}</option>
                <option value="corporate">{t("dossiers.filter_type_corporate")}</option>
              </select>
            </div>
          </div>
        </div>
      </DashboardCard>

      {dbLoad === "loading" && (
        <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
          {t("dossiers.database_loading")}
        </p>
      )}

      {useLiveDb && (
        <section className="mb-10">
          {filteredDb.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border px-6 py-10 text-center"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {dbItems.length === 0 ? t("dossiers.database_empty") : t("dossiers.no_results")}
              </p>
              {dbItems.length > 0 && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {t("dossiers.no_results_hint")}
                </p>
              )}
            </div>
          ) : (
            <DossierGroupedList
              groups={groupedDb}
              flatEntries={sortedFlatDb}
              filter={filter}
              viewMode={viewMode}
              typeFilter={typeFilter}
              deletingId={deletingId}
              onDeleteDossier={handleDeleteDossier}
              showDelete={canMutate}
            />
          )}
        </section>
      )}
    </>
  );
}
