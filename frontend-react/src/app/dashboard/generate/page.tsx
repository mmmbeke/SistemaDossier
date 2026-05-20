"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import TopBar from "@/components/dashboard/TopBar";
import DepthSelector from "@/components/dossier/DepthSelector";
import FormField from "@/components/FormField";
import GenerationProgress from "@/components/dossier/GenerationProgress";
import PrimaryButton from "@/components/PrimaryButton";
import { useTranslation } from "@/providers/PreferencesProvider";
import type { TranslationKey } from "@/i18n/types";
import {
  DEPTH_OPTIONS,
  type DossierDepth,
  type GenerationStepId,
  resolveDossierId,
  simulateGeneration,
  stepsForDepth,
} from "@/lib/mock-generation";

type Phase = "form" | "generating" | "done";

const PIPELINE_STEP_KEYS: TranslationKey[] = [
  "gen.step.starting",
  "gen.step.corporate",
  "gen.step.news",
  "gen.step.synthesis",
  "gen.step.complete",
];

export default function GenerateDossierPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [depth, setDepth] = useState<DossierDepth>("standard");
  const [phase, setPhase] = useState<Phase>("form");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState("");
  const [resultId, setResultId] = useState<string | null>(null);

  const steps = useMemo(() => stepsForDepth(depth), [depth]);
  const selectedDepth = DEPTH_OPTIONS.find((d) => d.id === depth)!;

  async function handleGenerate() {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError(t("generate.error.query_min"));
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t("auth.error.email_invalid"));
      return;
    }

    setError("");
    setPhase("generating");
    setCurrentStepIndex(0);
    const dossierId = resolveDossierId(trimmed);

    await simulateGeneration(depth, (_stepId: GenerationStepId, index: number) => {
      setCurrentStepIndex(index);
    });

    setPhase("done");
    setResultId(dossierId);

    window.setTimeout(() => {
      router.push(`/dashboard/dossiers/${dossierId}`);
    }, 900);
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
          {t("generate.back")}
        </Link>
      </nav>

      <TopBar
        title={t("generate.title")}
        subtitle={t("generate.subtitle")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <DashboardCard title={t("generate.contact_data")}>
            {phase === "form" ? (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleGenerate();
                }}
              >
                <FormField
                  label={t("generate.name_or_company")}
                  name="query"
                  placeholder={t("generate.name_placeholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  hint={t("generate.name_hint")}
                />
                <FormField
                  label={t("generate.email_optional")}
                  name="email"
                  type="email"
                  placeholder="participante@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <div className="flex flex-col gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {t("generate.depth_label")}
                  </span>
                  <DepthSelector value={depth} onChange={setDepth} />
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}

                <PrimaryButton type="submit">
                  {t("generate.submit", { credits: selectedDepth.credits })}
                </PrimaryButton>
              </form>
            ) : (
              <GenerationProgress
                steps={steps}
                currentIndex={currentStepIndex}
                isRunning={phase === "generating"}
              />
            )}
          </DashboardCard>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <DashboardCard title={t("generate.summary")}>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-muted)" }}>{t("generate.plan")}</dt>
                <dd style={{ color: "var(--text-primary)" }}>Pro · 500 cr/mes</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-muted)" }}>{t("generate.credits_cost")}</dt>
                <dd style={{ color: "var(--accent-from)" }}>
                  {selectedDepth.credits}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-muted)" }}>{t("generate.eta")}</dt>
                <dd style={{ color: "var(--text-primary)" }}>
                  ~{selectedDepth.etaSeconds}s
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-muted)" }}>{t("generate.modules")}</dt>
                <dd
                  className="text-right"
                  style={{ color: "var(--text-primary)" }}
                >
                  {selectedDepth.modules.join(", ")}
                </dd>
              </div>
            </dl>
          </DashboardCard>

          <DashboardCard title={t("generate.pipeline_title")}>
            <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
              {t("generate.pipeline_desc")}
            </p>
            <ul className="flex flex-col gap-2 text-xs" style={{ color: "var(--text-subtle)" }}>
              {PIPELINE_STEP_KEYS.map((key, i) => (
                <li key={key}>
                  {i + 1}. {t(key)}
                </li>
              ))}
            </ul>
          </DashboardCard>

          {phase === "done" && resultId && (
            <div
              className="rounded-xl border p-4 text-sm"
              style={{
                borderColor: "rgba(52, 211, 153, 0.25)",
                backgroundColor: "rgba(52, 211, 153, 0.08)",
                color: "#34d399",
              }}
            >
              {t("generate.done_redirect")}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
