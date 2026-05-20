export type PlanTier = "free" | "pro" | "enterprise";

export type Plan = {
  id: PlanTier;
  name: string;
  price: string;
  credits: string;
  features: string[];
  highlighted?: boolean;
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
    highlighted: true,
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

export const CURRENT_USAGE = {
  plan: "pro" as PlanTier,
  creditsUsed: 156,
  creditsTotal: 500,
  billingCycleEnd: "2026-06-01",
};
