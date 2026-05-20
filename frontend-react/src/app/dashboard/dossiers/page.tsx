"use client";

import { useMemo, useState } from "react";
import DossierCard from "@/components/dossier/DossierCard";
import FilterTabs, { type FilterValue } from "@/components/dossier/FilterTabs";
import TopBar from "@/components/dashboard/TopBar";
import NewDossierButton from "@/components/dossier/NewDossierButton";
import { useTranslation } from "@/providers/PreferencesProvider";
import { dossiers } from "@/lib/mock-dossiers";

export default function DossiersPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dossiers.filter((d) => {
      const matchesQuery =
        q === "" ||
        d.identity.name.toLowerCase().includes(q) ||
        d.identity.company.toLowerCase().includes(q) ||
        d.identity.current_role.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "complete" && d.freshness === "up_to_date") ||
        (filter === "needs_update" && d.freshness === "needs_update");
      return matchesQuery && matchesFilter;
    });
  }, [query, filter]);

  const counts = {
    all: dossiers.length,
    complete: dossiers.filter((d) => d.freshness === "up_to_date").length,
    needs_update: dossiers.filter((d) => d.freshness === "needs_update").length,
  };

  const filterAllLabel = t("dossiers.filter_all").replace(/\s*\(\d+\)/, ` (${counts.all})`);

  return (
    <>
      <TopBar
        title={t("dossiers.title")}
        subtitle={t("dossiers.subtitle")}
        action={<NewDossierButton />}
      />

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

      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-xl border px-6 py-20 text-center"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {t("dossiers.no_results")}
          </h3>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("dossiers.no_results_hint")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((dossier) => (
            <DossierCard key={dossier.id} dossier={dossier} />
          ))}
        </div>
      )}
    </>
  );
}
