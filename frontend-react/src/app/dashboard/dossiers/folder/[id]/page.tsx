"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import CalendarMeetingLabel from "@/components/dossier/CalendarMeetingLabel";
import DossierFolderCard from "@/components/dossier/DossierFolderCard";
import {
  DossierApiError,
  deleteDossierFromApi,
  fetchDossierFolderById,
  type DossierFolderDetailResponse,
  type DossierListItem,
} from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function DossierFolderPage() {
  const params = useParams();
  const folderId = typeof params?.id === "string" ? params.id : "";
  const { t } = useTranslation();
  const [folder, setFolder] = useState<DossierFolderDetailResponse | null>(null);
  const [load, setLoad] = useState<"loading" | "ok" | "err">("loading");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!folderId || !UUID_RE.test(folderId)) return;
    let cancelled = false;
    setLoad("loading");
    void fetchDossierFolderById(folderId)
      .then((data) => {
        if (cancelled) return;
        setFolder(data);
        setLoad("ok");
      })
      .catch((e) => {
        if (cancelled) return;
        setFolder(null);
        setLoad("err");
        setError(e instanceof DossierApiError ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  if (!folderId || !UUID_RE.test(folderId)) {
    notFound();
  }

  async function handleDeleteDossier(row: DossierListItem) {
    if (deletingId) return;
    if (!window.confirm(t("dossiers.delete_confirm"))) return;
    setDeletingId(row.id);
    setError(null);
    try {
      await deleteDossierFromApi(row.id);
      setFolder((prev) => {
        if (!prev) return prev;
        const dossiers = prev.dossiers.filter((d) => d.id !== row.id);
        return { ...prev, dossiers };
      });
    } catch (e) {
      setError(e instanceof DossierApiError ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  if (load === "loading") {
    return (
      <div className="p-8 text-sm" style={{ color: "var(--text-muted)" }}>
        {t("dossiers.folder_loading")}
      </div>
    );
  }

  if (load === "err" || !folder) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {error || t("dossiers.folder_not_found")}
        </p>
        <Link
          href="/dashboard/dossiers"
          className="text-sm font-medium underline"
          style={{ color: "var(--accent-from)" }}
        >
          {t("detail.back")}
        </Link>
      </div>
    );
  }

  if (folder.dossiers.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("dossiers.folder_empty")}
        </p>
        <Link href="/dashboard/dossiers" className="text-sm font-medium underline" style={{ color: "var(--accent-from)" }}>
          {t("detail.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <nav className="mb-6">
        <Link
          href="/dashboard/dossiers"
          className="inline-flex items-center gap-1.5 text-sm transition hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          ← {t("detail.back")}
        </Link>
      </nav>

      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent-from)" }}>
          📁 {t("dossiers.folder_label")}
        </p>
        <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          {folder.title}
        </h1>
        <CalendarMeetingLabel
          trigger_source={folder.trigger_source}
          calendar_meeting={folder.calendar_meeting}
          dossier_data={folder.dossiers[0]?.dossier_data}
        />
      </header>

      {error ? (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      <DossierFolderCard folder={folder} deletingId={deletingId} onDeleteDossier={handleDeleteDossier} />
    </div>
  );
}
