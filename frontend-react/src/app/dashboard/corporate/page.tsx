"use client";

import CorporateDossierGenerateView from "@/components/dashboard/CorporateDossierGenerateView";

/**
 * Generación dedicada de dossiers corporativos (UK Companies House + US SEC).
 */
export default function CorporateDossierGeneratePage() {
  return (
    <CorporateDossierGenerateView
      initialQuery=""
      autoDisambiguate={false}
      backHref="/dashboard"
      backLabelKey="corporate_page.back"
      titleKey="corporate_page.title"
      subtitleKey="corporate_page.subtitle"
    />
  );
}
