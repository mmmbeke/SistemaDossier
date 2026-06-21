"use client";

import Link from "next/link";
import CalendarMeetingLabel from "@/components/dossier/CalendarMeetingLabel";
import type { DossierFolderListItem, DossierListItem } from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";

type Props = {
  folder: DossierFolderListItem;
  deletingId: string | null;
  onDeleteDossier: (row: DossierListItem) => void;
};

function ChildDossierRow({
  row,
  label,
  deletingId,
  onDelete,
}: {
  row: DossierListItem;
  label: string;
  deletingId: string | null;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex gap-1 rounded-lg border"
      style={{
        borderColor: "var(--border-default)",
        backgroundColor: "var(--bg-input)",
      }}
    >
      <Link
        href={`/dashboard/dossiers/${row.id}`}
        className="flex min-w-0 flex-1 flex-col gap-1 p-3 text-left"
      >
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
          {label}
        </span>
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {row.subject_name || row.subject_email || "—"}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {row.status} · {row.depth_level}
        </span>
      </Link>
      <button
        type="button"
        disabled={deletingId === row.id}
        onClick={onDelete}
        className="shrink-0 self-stretch rounded-r-lg px-2 text-xs transition hover:bg-red-500/15 disabled:opacity-50"
        style={{ color: "var(--text-muted)" }}
        title={t("dossiers.delete_aria")}
        aria-label={t("dossiers.delete_aria")}
      >
        {deletingId === row.id ? t("dossiers.deleting") : t("dossiers.delete")}
      </button>
    </div>
  );
}

export default function DossierFolderCard({ folder, deletingId, onDeleteDossier }: Props) {
  const { t } = useTranslation();
  const corporate = folder.dossiers.find((d) => d.module_kind === "corporate");
  const person = folder.dossiers.find((d) => d.module_kind === "person");
  const others = folder.dossiers.filter(
    (d) => d.id !== corporate?.id && d.id !== person?.id
  );

  return (
    <article
      className="col-span-1 flex flex-col gap-3 rounded-xl border p-4 sm:col-span-2 lg:col-span-3"
      style={{
        borderColor: "var(--border-default)",
        backgroundColor: "var(--bg-surface)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent-from)" }}>
            📁 {t("dossiers.folder_label")}
          </p>
          <Link
            href={`/dashboard/dossiers/folder/${folder.id}`}
            className="mt-1 block text-base font-semibold hover:underline"
            style={{ color: "var(--text-primary)" }}
          >
            {folder.title}
          </Link>
          <CalendarMeetingLabel
            trigger_source={folder.trigger_source}
            calendar_meeting={folder.calendar_meeting}
            dossier_data={folder.dossiers[0]?.dossier_data}
            compact
          />
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {folder.dossiers.length}{" "}
            {folder.dossiers.length === 1 ? t("dossiers.folder_one_dossier") : t("dossiers.folder_n_dossiers")}{" "}
            · {folder.status}
            {folder.created_at ? ` · ${folder.created_at.slice(0, 10)}` : ""}
          </p>
        </div>
        <Link
          href={`/dashboard/dossiers/folder/${folder.id}`}
          className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:opacity-90"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--accent-from)",
          }}
        >
          {t("dossiers.folder_open")}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {corporate ? (
          <ChildDossierRow
            row={corporate}
            label={t("overview.calendar_dossier_corporate")}
            deletingId={deletingId}
            onDelete={() => onDeleteDossier(corporate)}
          />
        ) : null}
        {person ? (
          <ChildDossierRow
            row={person}
            label={t("overview.calendar_dossier_person")}
            deletingId={deletingId}
            onDelete={() => onDeleteDossier(person)}
          />
        ) : null}
        {others.map((row) => (
          <ChildDossierRow
            key={row.id}
            row={row}
            label={t("dossiers.folder_other_dossier")}
            deletingId={deletingId}
            onDelete={() => onDeleteDossier(row)}
          />
        ))}
      </div>
    </article>
  );
}
