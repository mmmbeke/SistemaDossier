"use client";

import { useTranslation } from "@/providers/PreferencesProvider";
import type { GenerationStep, GenerationStepId } from "@/lib/mock-generation";

type GenerationProgressProps = {
  steps: GenerationStep[];
  currentIndex: number;
  isRunning: boolean;
};

function stepState(
  index: number,
  currentIndex: number,
  isRunning: boolean
): "pending" | "active" | "done" {
  if (index < currentIndex) return "done";
  if (index === currentIndex && isRunning) return "active";
  if (index === currentIndex && !isRunning) return "done";
  return "pending";
}

function StepIcon({
  state,
  stepId,
}: {
  state: "pending" | "active" | "done";
  stepId: GenerationStepId;
}) {
  if (state === "done" && stepId === "complete") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-emerald-400">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (state === "done") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-emerald-400">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (state === "active") {
    return (
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
    );
  }
  return <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--text-subtle)" }} />;
}

export default function GenerationProgress({
  steps,
  currentIndex,
  isRunning,
}: GenerationProgressProps) {
  const { t } = useTranslation();
  const progress =
    steps.length <= 1 ? 0 : Math.round((currentIndex / (steps.length - 1)) * 100);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span style={{ color: "var(--text-muted)" }}>{progress}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full"
          style={{ backgroundColor: "var(--bg-surface-strong)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              backgroundImage:
                "linear-gradient(90deg, var(--accent-from) 0%, var(--accent-to) 100%)",
            }}
          />
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {steps.map((step, index) => {
          const state = stepState(index, currentIndex, isRunning);
          return (
            <li
              key={step.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
              style={{
                borderColor:
                  state === "active"
                    ? "rgba(59, 130, 246, 0.35)"
                    : "var(--border-default)",
                backgroundColor:
                  state === "active"
                    ? "rgba(59, 130, 246, 0.06)"
                    : "var(--bg-surface)",
              }}
            >
              <div className="flex h-5 w-5 items-center justify-center">
                <StepIcon state={state} stepId={step.id} />
              </div>
              <span
                className="text-sm"
                style={{
                  color:
                    state === "pending"
                      ? "var(--text-subtle)"
                      : "var(--text-primary)",
                  fontWeight: state === "active" ? 600 : 400,
                }}
              >
                {t(step.labelKey)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
