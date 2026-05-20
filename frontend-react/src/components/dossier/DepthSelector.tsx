"use client";

import { useTranslation } from "@/providers/PreferencesProvider";
import type { DossierDepth } from "@/lib/mock-generation";
import { DEPTH_OPTIONS } from "@/lib/mock-generation";

type DepthSelectorProps = {
  value: DossierDepth;
  onChange: (depth: DossierDepth) => void;
  disabled?: boolean;
};

export default function DepthSelector({
  value,
  onChange,
  disabled,
}: DepthSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {DEPTH_OPTIONS.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className="flex flex-col gap-2 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: selected ? "var(--accent-from)" : "var(--border-default)",
              backgroundColor: selected
                ? "rgba(59, 130, 246, 0.08)"
                : "var(--bg-surface)",
              boxShadow: selected
                ? "0 0 0 1px rgba(59, 130, 246, 0.35)"
                : undefined,
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {t(opt.labelKey)}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: "var(--bg-surface-strong)",
                  color: "var(--accent-from)",
                }}
              >
                {opt.credits} cr
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t(opt.descKey)}
            </p>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
              ~{opt.etaSeconds}s · {opt.modules.join(" + ")}
            </p>
          </button>
        );
      })}
    </div>
  );
}
