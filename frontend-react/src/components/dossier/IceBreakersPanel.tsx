import type { IceBreaker } from "@/lib/mock-dossiers";

export default function IceBreakersPanel({
  iceBreakers,
}: {
  iceBreakers: IceBreaker[];
}) {
  if (iceBreakers.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        No se encontraron ice breakers en las fuentes públicas consultadas.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {iceBreakers.map((ib, idx) => (
        <li
          key={idx}
          className="flex gap-3 rounded-lg border p-4"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
            style={{
              backgroundColor: "var(--bg-surface-strong)",
              color: "var(--accent-from)",
            }}
          >
            {idx + 1}
          </span>
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              {ib.text}
            </p>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Fuente:{" "}
              {ib.source_url ? (
                <a
                  href={ib.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                  style={{ color: "var(--accent-from)" }}
                >
                  {ib.source}
                </a>
              ) : (
                ib.source
              )}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
