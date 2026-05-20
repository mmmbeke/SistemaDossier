import { notFound } from "next/navigation";
import DossierDetailView from "./DossierDetailView";
import { dossiers, getDossierById } from "@/lib/mock-dossiers";

export function generateStaticParams() {
  return dossiers.map((d) => ({ id: d.id }));
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DossierDetailPage({ params }: PageProps) {
  const { id } = await params;
  const dossier = getDossierById(id);
  if (!dossier) notFound();

  return <DossierDetailView dossier={dossier} />;
}
