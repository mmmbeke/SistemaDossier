export type DossierBadge =
  | "Serial Founder"
  | "VC Backed"
  | "First-Time Founder"
  | "C-Level"
  | "Senior IC";

export type DossierStatus = "complete" | "partial" | "failed";
export type DossierFreshness = "up_to_date" | "needs_update";
export type AlertLevel = "critical" | "warning";

export type Alert = {
  level: AlertLevel;
  message: string;
  source?: string;
};

export type CorporateRecord = {
  company_name: string;
  role: string;
  status: "active" | "dissolved" | "liquidation";
  country: string;
  date: string;
};

export type CareerEntry = {
  company: string;
  role: string;
  start: string;
  end: string | null;
  gap_months?: number;
  discrepancy?: string;
};

export type IceBreaker = {
  text: string;
  source: string;
  source_url?: string;
};

export type Dossier = {
  id: string;
  initials: string;
  status: DossierStatus;
  freshness: DossierFreshness;
  updated_at: string;
  identity: {
    name: string;
    current_role: string;
    company: string;
    tenure_months: number;
    badge: DossierBadge;
    location?: string;
  };
  alerts: Alert[];
  ice_breakers: IceBreaker[];
  corporate_records: CorporateRecord[];
  career_timeline: CareerEntry[];
  data_sources: string[];
};

export const dossiers: Dossier[] = [
  {
    id: "sm-nexus",
    initials: "SM",
    status: "complete",
    freshness: "up_to_date",
    updated_at: "2026-05-15",
    identity: {
      name: "Sarah Mitchell",
      current_role: "Chief Strategy Officer",
      company: "Nexus Ventures",
      tenure_months: 18,
      badge: "Serial Founder",
      location: "London, UK",
    },
    alerts: [],
    ice_breakers: [
      {
        text: "Apareció en el podcast 'Female Founders Today' hablando sobre estrategia post Serie B.",
        source: "Female Founders Today · Ep. 142",
        source_url: "https://example.com/podcast/142",
      },
      {
        text: "Voluntaria activa en Code First Girls, mentora de mujeres en tecnología.",
        source: "Code First Girls Mentor Directory",
      },
      {
        text: "Publicó un artículo reciente en Medium sobre due diligence ágil.",
        source: "Medium · @sarahmitchell",
      },
    ],
    corporate_records: [
      {
        company_name: "Nexus Ventures Ltd",
        role: "Director",
        status: "active",
        country: "UK",
        date: "2024-11-02",
      },
      {
        company_name: "Mitchell Strategy Group",
        role: "Founder & Director",
        status: "active",
        country: "UK",
        date: "2020-03-15",
      },
      {
        company_name: "Bright Path Tech",
        role: "Co-founder",
        status: "dissolved",
        country: "UK",
        date: "2017-08-01",
      },
    ],
    career_timeline: [
      {
        company: "Nexus Ventures",
        role: "Chief Strategy Officer",
        start: "2024-11",
        end: null,
      },
      {
        company: "Mitchell Strategy Group",
        role: "Founder",
        start: "2020-03",
        end: "2024-10",
      },
      {
        company: "Bright Path Tech",
        role: "Co-founder & COO",
        start: "2015-01",
        end: "2017-08",
      },
    ],
    data_sources: [
      "Companies House (UK)",
      "Proxycurl",
      "Tavily News API",
      "Female Founders Today Podcast",
    ],
  },
  {
    id: "jc-techflow",
    initials: "JC",
    status: "complete",
    freshness: "up_to_date",
    updated_at: "2026-05-14",
    identity: {
      name: "James Chen",
      current_role: "Chief Executive Officer",
      company: "TechFlow AI",
      tenure_months: 32,
      badge: "VC Backed",
      location: "San Francisco, USA",
    },
    alerts: [],
    ice_breakers: [
      {
        text: "TechFlow AI levantó Serie B de $40M la semana pasada con Sequoia liderando la ronda.",
        source: "TechCrunch · Mayo 2026",
        source_url: "https://example.com/techcrunch",
      },
      {
        text: "Mantiene un newsletter quincenal sobre infraestructura de ML con ~12k suscriptores.",
        source: "Substack · jameschen.ai",
      },
    ],
    corporate_records: [
      {
        company_name: "TechFlow AI, Inc.",
        role: "CEO & Director",
        status: "active",
        country: "USA",
        date: "2023-09-10",
      },
    ],
    career_timeline: [
      {
        company: "TechFlow AI",
        role: "CEO",
        start: "2023-09",
        end: null,
      },
      {
        company: "Google",
        role: "Senior Engineering Manager",
        start: "2019-04",
        end: "2023-08",
      },
      {
        company: "Stripe",
        role: "Engineering Lead",
        start: "2016-01",
        end: "2019-03",
      },
    ],
    data_sources: ["SEC EDGAR", "Proxycurl", "Tavily News API"],
  },
  {
    id: "er-datasync",
    initials: "ER",
    status: "complete",
    freshness: "up_to_date",
    updated_at: "2026-05-13",
    identity: {
      name: "Emma Rodriguez",
      current_role: "Chief Technology Officer",
      company: "DataSync Corp",
      tenure_months: 24,
      badge: "C-Level",
      location: "Madrid, España",
    },
    alerts: [],
    ice_breakers: [
      {
        text: "Charla destacada en KubeCon Europa 2026 sobre observabilidad de pipelines.",
        source: "KubeCon Europe 2026",
      },
      {
        text: "Es runner amateur, terminó la Maratón de Berlín en 2025 (3h 52min).",
        source: "Strava perfil público",
      },
    ],
    corporate_records: [
      {
        company_name: "DataSync Corp S.L.",
        role: "Administrador único",
        status: "active",
        country: "ES",
        date: "2023-05-12",
      },
    ],
    career_timeline: [
      {
        company: "DataSync Corp",
        role: "CTO",
        start: "2023-05",
        end: null,
      },
      {
        company: "Telefónica",
        role: "Head of Data Platform",
        start: "2018-09",
        end: "2023-04",
      },
    ],
    data_sources: ["Registro Mercantil (ES)", "Proxycurl", "Tavily News API"],
  },
  {
    id: "mf-quantum",
    initials: "MF",
    status: "partial",
    freshness: "needs_update",
    updated_at: "2026-04-02",
    identity: {
      name: "Michael Foster",
      current_role: "Founder",
      company: "Quantum Labs",
      tenure_months: 8,
      badge: "Serial Founder",
      location: "Berlin, Alemania",
    },
    alerts: [
      {
        level: "critical",
        message:
          "Empresa previa 'Foster Industries GmbH' en proceso de liquidación.",
        source: "Handelsregister (DE)",
      },
      {
        level: "warning",
        message:
          "Cobertura de prensa negativa reciente sobre disputa con cofundador anterior.",
        source: "Handelsblatt · Abril 2026",
      },
    ],
    ice_breakers: [
      {
        text: "Aficionado a la fotografía analógica, expuso en una galería de Berlín en 2024.",
        source: "Berlin Art Magazine",
      },
    ],
    corporate_records: [
      {
        company_name: "Quantum Labs UG",
        role: "Geschäftsführer",
        status: "active",
        country: "DE",
        date: "2025-09-21",
      },
      {
        company_name: "Foster Industries GmbH",
        role: "Geschäftsführer",
        status: "liquidation",
        country: "DE",
        date: "2017-02-14",
      },
    ],
    career_timeline: [
      {
        company: "Quantum Labs",
        role: "Founder",
        start: "2025-09",
        end: null,
      },
      {
        company: "Foster Industries",
        role: "CEO",
        start: "2017-02",
        end: "2025-06",
        discrepancy:
          "LinkedIn declara hasta 2025-08, registro oficial cerró 2025-06.",
      },
    ],
    data_sources: ["Handelsregister (DE)", "Proxycurl", "Tavily News API"],
  },
  {
    id: "ak-greenroad",
    initials: "AK",
    status: "complete",
    freshness: "needs_update",
    updated_at: "2026-04-10",
    identity: {
      name: "Aisha Khan",
      current_role: "Head of Product",
      company: "GreenRoad Systems",
      tenure_months: 14,
      badge: "Senior IC",
      location: "Manchester, UK",
    },
    alerts: [
      {
        level: "warning",
        message:
          "Notas de prensa sobre reducción de plantilla del 12% en su empresa anterior.",
        source: "Financial Times · Marzo 2026",
      },
    ],
    ice_breakers: [
      {
        text: "Forma parte del consejo asesor de una ONG de educación en Pakistán.",
        source: "ONG Roshni · Annual Report 2025",
      },
      {
        text: "Recientemente entrevistada en el podcast 'Product Thinking'.",
        source: "Product Thinking Podcast",
      },
    ],
    corporate_records: [
      {
        company_name: "GreenRoad Systems Ltd",
        role: "Director",
        status: "active",
        country: "UK",
        date: "2025-02-08",
      },
    ],
    career_timeline: [
      {
        company: "GreenRoad Systems",
        role: "Head of Product",
        start: "2025-02",
        end: null,
      },
      {
        company: "Northwind Mobility",
        role: "Senior Product Manager",
        start: "2021-06",
        end: "2025-01",
      },
    ],
    data_sources: ["Companies House (UK)", "Proxycurl", "Tavily News API"],
  },
  {
    id: "lp-arborvc",
    initials: "LP",
    status: "complete",
    freshness: "up_to_date",
    updated_at: "2026-05-16",
    identity: {
      name: "Lucas Pereira",
      current_role: "General Partner",
      company: "Arbor Ventures",
      tenure_months: 41,
      badge: "VC Backed",
      location: "New York, USA",
    },
    alerts: [],
    ice_breakers: [
      {
        text: "Tesis de inversión 2026: focus en developer tools y open source.",
        source: "Arbor Ventures Blog",
      },
      {
        text: "Co-host del podcast 'Capital Flows'.",
        source: "Capital Flows Podcast",
      },
      {
        text: "Mentor activo en First Round Capital's founder community.",
        source: "First Round Community",
      },
    ],
    corporate_records: [
      {
        company_name: "Arbor Ventures Fund III, LP",
        role: "General Partner",
        status: "active",
        country: "USA",
        date: "2022-12-01",
      },
    ],
    career_timeline: [
      {
        company: "Arbor Ventures",
        role: "General Partner",
        start: "2022-12",
        end: null,
      },
      {
        company: "First Round Capital",
        role: "Principal",
        start: "2018-09",
        end: "2022-11",
      },
    ],
    data_sources: ["SEC EDGAR", "Proxycurl", "Tavily News API", "Capital Flows Podcast"],
  },
];

export function getDossierById(id: string): Dossier | undefined {
  return dossiers.find((d) => d.id === id);
}

export function formatTenure(months: number): string {
  if (months < 12) return `${months} meses`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (m === 0) return `${y} ${y === 1 ? "año" : "años"}`;
  return `${y}a ${m}m`;
}
