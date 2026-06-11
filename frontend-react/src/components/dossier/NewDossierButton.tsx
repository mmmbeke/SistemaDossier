"use client";

import Link from "next/link";
import { useTranslation } from "@/providers/PreferencesProvider";

type NewDossierButtonProps = {
  className?: string;
};

export default function NewDossierButton({ className = "" }: NewDossierButtonProps) {
  const { t } = useTranslation();

  return (
    <Link
      href="/dashboard/corporate"
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:opacity-95 ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {t("btn.new_dossier")}
    </Link>
  );
}
