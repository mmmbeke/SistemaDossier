export type PlanTier = "free" | "pro" | "enterprise";

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
