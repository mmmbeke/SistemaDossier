"use client";

import type { DossierViewMode } from "@/lib/dossier-list-utils";

type ViewTab = {
  value: DossierViewMode;
  label: string;
  count: number;
};

type DossierViewTabsProps = {
  tabs: ViewTab[];
  active: DossierViewMode;
  onChange: (value: DossierViewMode) => void;
};

export default function DossierViewTabs({ tabs, active, onChange }: DossierViewTabsProps) {
  return (
    <div
      className="inline-flex flex-wrap items-center gap-1 rounded-lg border p-1"
      style={{
        borderColor: "var(--border-default)",
        backgroundColor: "var(--bg-surface)",
      }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className="rounded-md px-3 py-1.5 text-sm font-medium transition"
            style={{
              backgroundColor: isActive ? "var(--bg-surface-strong)" : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {tab.label}
            <span className="ml-1.5 text-xs" style={{ color: "var(--text-subtle)" }}>
              ({tab.count})
            </span>
          </button>
        );
      })}
    </div>
  );
}
