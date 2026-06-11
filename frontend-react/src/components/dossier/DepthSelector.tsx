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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-3">
      {DEPTH_OPTIONS.map((opt) => {
        const selected = value === opt.id;
        const creditsLabel =
          opt.credits === 1
            ? t("depth.credits_one")
            : t("depth.credits_many", { n: opt.credits });

        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className="flex flex-col gap-2 rounded-xl border px-3.5 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[7.25rem] sm:px-4 sm:py-3.5"
            style={{
              borderColor: selected ? "var(--accent-from)" : "var(--border-default)",
              backgroundColor: selected
                ? "rgba(59, 130, 246, 0.1)"
                : "var(--bg-surface)",
              boxShadow: selected ? "0 0 0 2px rgba(59, 130, 246, 0.45)" : undefined,
            }}
          >
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
              <span
                className="min-w-0 text-base font-semibold leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {t(opt.labelKey)}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className="inline-flex items-center whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-semibold tabular-nums sm:text-[13px]"
                  style={{
                    borderColor: "var(--border-default)",
                    backgroundColor: "var(--bg-surface-strong)",
                    color: "var(--text-primary)",
                  }}
                >
                  {t("depth.approx_time", { seconds: opt.etaSeconds })}
                </span>
                <span
                  className="inline-flex max-w-full items-center whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold sm:text-[13px]"
                  style={{
                    backgroundColor: "rgba(59, 130, 246, 0.14)",
                    color: "var(--accent-from)",
                    border: "1px solid rgba(59, 130, 246, 0.4)",
                  }}
                >
                  {creditsLabel}
                </span>
              </div>
            </div>
            <p className="text-xs leading-relaxed sm:text-[13px]" style={{ color: "var(--text-muted)" }}>
              {t(opt.descKey)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
