import type { TranslationKey } from "@/i18n/types";

export type DossierDepth = "basic" | "standard" | "deep";

export type GenerationStepId =
  | "starting"
  | "corporate"
  | "news"
  | "synthesis"
  | "complete";

export type GenerationStep = {
  id: GenerationStepId;
  labelKey: TranslationKey;
  durationMs: number;
};

export type DepthOption = {
  id: DossierDepth;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  /** Línea corta tiempo + beneficio (sin jerga de módulos). */
  metaKey: TranslationKey;
  credits: number;
  etaSeconds: number;
  modules: string[];
};

export const DEPTH_OPTIONS: DepthOption[] = [
  {
    id: "basic",
    labelKey: "depth.option_basic_label",
    descKey: "depth.option_basic_desc",
    metaKey: "depth.option_basic_meta",
    credits: 1,
    etaSeconds: 15,
    modules: ["A"],
  },
  {
    id: "standard",
    labelKey: "depth.option_standard_label",
    descKey: "depth.option_standard_desc",
    metaKey: "depth.option_standard_meta",
    credits: 3,
    etaSeconds: 45,
    modules: ["A", "B"],
  },
  {
    id: "deep",
    labelKey: "depth.option_deep_label",
    descKey: "depth.option_deep_desc",
    metaKey: "depth.option_deep_meta",
    credits: 5,
    etaSeconds: 90,
    modules: ["A", "B", "C"],
  },
];

const ALL_STEPS: GenerationStep[] = [
  { id: "starting", labelKey: "gen.step.starting", durationMs: 1200 },
  {
    id: "corporate",
    labelKey: "gen.step.corporate",
    durationMs: 2000,
  },
  { id: "news", labelKey: "gen.step.news", durationMs: 2200 },
  { id: "synthesis", labelKey: "gen.step.synthesis", durationMs: 2500 },
  { id: "complete", labelKey: "gen.step.complete", durationMs: 600 },
];

export function stepsForDepth(depth: DossierDepth): GenerationStep[] {
  switch (depth) {
    case "basic":
      return ALL_STEPS.filter((s) =>
        ["starting", "synthesis", "complete"].includes(s.id)
      );
    case "standard":
      return ALL_STEPS.filter((s) => s.id !== "news");
    case "deep":
      return ALL_STEPS;
  }
}

/** Reservado para enlazar búsquedas con IDs reales de la API; ya no usa datos demo. */
export function resolveDossierId(query: string): string {
  return query.trim();
}

export async function simulateGeneration(
  depth: DossierDepth,
  onStep: (stepId: GenerationStepId, index: number) => void
): Promise<void> {
  const steps = stepsForDepth(depth);
  for (let i = 0; i < steps.length; i++) {
    onStep(steps[i].id, i);
    await new Promise((r) => setTimeout(r, steps[i].durationMs));
  }
}
