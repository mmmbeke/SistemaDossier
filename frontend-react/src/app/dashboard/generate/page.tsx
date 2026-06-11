"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CorporateDossierGenerateView from "@/components/dashboard/CorporateDossierGenerateView";

export default function GenerateDossierPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm" style={{ color: "var(--text-muted)" }}>
          …
        </div>
      }
    >
      <GenerateDossierPageWithQuery />
    </Suspense>
  );
}

function GenerateDossierPageWithQuery() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q")?.trim() ?? "";
  const pick = searchParams.get("pick") === "1";
  return (
    <CorporateDossierGenerateView
      key={`${q || "__empty__"}__${pick ? "pick" : "nopick"}`}
      initialQuery={q}
      autoDisambiguate={pick}
      backHref="/dashboard/dossiers"
      backLabelKey="generate.back"
      titleKey="generate.title"
      subtitleKey="generate.subtitle"
    />
  );
}
