import type { CareerEntry } from "@/lib/mock-dossiers";

function monthsBetween(start: string, end: string | null): number {
  const s = new Date(start + "-01");
  const e = end ? new Date(end + "-01") : new Date();
  const months =
    (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return Math.max(0, months);
}

function formatPeriod(months: number): string {
  if (months < 12) return `${months} meses`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (m === 0) return `${y} ${y === 1 ? "año" : "años"}`;
  return `${y}a ${m}m`;
}

export default function CareerTimeline({ entries }: { entries: CareerEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Sin historial profesional disponible.
      </p>
    );
  }

  return (
    <ol className="relative flex flex-col gap-6 pl-6">
      <div
        className="absolute left-2 top-2 bottom-2 w-px"
        style={{ backgroundColor: "var(--border-strong)" }}
      />
      {entries.map((entry, idx) => {
        const months = monthsBetween(entry.start, entry.end);
        const period = formatPeriod(months);
        const endLabel = entry.end
          ? new Date(entry.end + "-01").toLocaleDateString("es-ES", {
              month: "short",
              year: "numeric",
            })
          : "Presente";
        const startLabel = new Date(entry.start + "-01").toLocaleDateString(
          "es-ES",
          { month: "short", year: "numeric" }
        );

        return (
          <li key={idx} className="relative flex flex-col gap-1">
            <span
              className="absolute -left-[18px] top-1.5 h-3 w-3 rounded-full ring-4"
              style={{
                backgroundColor:
                  idx === 0 ? "var(--accent-from)" : "var(--text-subtle)",
                boxShadow: "0 0 0 4px var(--bg-page)",
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {entry.role}
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--text-subtle)" }}
              >
                {period}
              </span>
            </div>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              {entry.company}
            </span>
            <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
              {startLabel} — {endLabel}
            </span>
            {entry.gap_months && entry.gap_months > 0 && (
              <span className="text-xs" style={{ color: "#fbbf24" }}>
                ⚠ Gap de {entry.gap_months} meses antes de este rol
              </span>
            )}
            {entry.discrepancy && (
              <span
                className="mt-1 inline-flex items-start gap-1.5 rounded-md px-2 py-1 text-xs"
                style={{
                  backgroundColor: "rgba(251, 191, 36, 0.10)",
                  color: "#fbbf24",
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-3 w-3 shrink-0">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                </svg>
                {entry.discrepancy}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
