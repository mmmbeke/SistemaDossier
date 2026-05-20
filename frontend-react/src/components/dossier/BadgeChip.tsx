"use client";

import { useTranslation } from "@/providers/PreferencesProvider";
import { translateBadge } from "@/lib/i18n-helpers";
import type { DossierBadge } from "@/lib/mock-dossiers";

export default function BadgeChip({ badge }: { badge: DossierBadge }) {
  const { t } = useTranslation();

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
      style={{
        borderColor: "var(--border-default)",
        backgroundColor: "var(--bg-surface-strong)",
        color: "var(--text-secondary)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-3 w-3"
        style={{ color: "var(--accent-from)" }}
      >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
      {translateBadge(badge, t)}
    </span>
  );
}
