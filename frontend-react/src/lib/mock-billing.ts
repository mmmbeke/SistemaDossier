import type { DossierDepth } from "@/lib/mock-generation";

export type PlanTier = "free" | "pro" | "enterprise";

export const ALLOWED_DEPTHS_BY_PLAN: Record<PlanTier, DossierDepth[]> = {
  free: ["basic"],
  pro: ["basic", "standard", "deep"],
  enterprise: ["basic", "standard", "deep"],
};

export function normalizePlanTier(raw: string | undefined | null): PlanTier {
  const p = (raw || "free").trim().toLowerCase();
  if (p === "pro" || p === "enterprise") return p;
  return "free";
}

export function allowedDepthsForPlan(plan: PlanTier): DossierDepth[] {
  return ALLOWED_DEPTHS_BY_PLAN[plan];
}

export function defaultDepthForPlan(plan: PlanTier): DossierDepth {
  return plan === "free" ? "basic" : "standard";
}

export function planAllowsCorporateDossier(plan: PlanTier): boolean {
  return plan !== "free";
}

export function planAllowsAutomation(plan: PlanTier): boolean {
  return plan !== "free";
}

export function planSummaryLabel(
  plan: PlanTier,
  creditsBalance?: number,
  monthlyLimit?: number,
): string {
  const cap =
    plan === "enterprise" || (monthlyLimit ?? 0) >= 999_999
      ? "Ilimitado"
      : `${monthlyLimit ?? "—"} cr/mes`;
  const name = plan === "free" ? "Free" : plan === "pro" ? "Pro" : "Enterprise";
  const balance =
    typeof creditsBalance === "number" ? ` · ${creditsBalance} disp.` : "";
  return `${name} · ${cap}${balance}`;
}

export type Plan = {
  id: PlanTier;
  name: string;
  price: string;
  credits: string;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "£0/mes",
    credits: "10 créditos/mes",
    features: ["Módulo A (Identidad)", "Sin automatización", "Soporte comunidad"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "Por definir",
    credits: "500 créditos/mes",
    features: [
      "Módulos A + B + C",
      "Automatización calendario",
      "Email + chat support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Negociado",
    credits: "Ilimitado",
    features: [
      "Todo Pro + API access",
      "SLA dedicado 24/7",
      "White-label (v2.0)",
    ],
  },
];
