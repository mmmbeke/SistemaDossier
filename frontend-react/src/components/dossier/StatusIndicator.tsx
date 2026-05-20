"use client";

import { useTranslation } from "@/providers/PreferencesProvider";
import type { DossierFreshness } from "@/lib/mock-dossiers";

export default function StatusIndicator({
  freshness,
}: {
  freshness: DossierFreshness;
}) {
  const { t } = useTranslation();
  const isFresh = freshness === "up_to_date";

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      style={{ color: isFresh ? "#34d399" : "#fbbf24" }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: isFresh ? "#34d399" : "#fbbf24" }}
      />
      {isFresh ? t("status.up_to_date") : t("status.needs_update")}
    </span>
  );
}
