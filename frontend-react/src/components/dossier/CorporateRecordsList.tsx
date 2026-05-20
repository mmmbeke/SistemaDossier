import type { CorporateRecord } from "@/lib/mock-dossiers";

function statusStyle(status: CorporateRecord["status"]) {
  switch (status) {
    case "active":
      return { color: "#34d399", label: "Activa" };
    case "dissolved":
      return { color: "var(--text-subtle)", label: "Disuelta" };
    case "liquidation":
      return { color: "#ef4444", label: "En liquidación" };
  }
}

export default function CorporateRecordsList({
  records,
}: {
  records: CorporateRecord[];
}) {
  if (records.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Sin registros corporativos públicos.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {records.map((rec, idx) => {
        const style = statusStyle(rec.status);
        return (
          <li
            key={idx}
            className="flex flex-col gap-1 rounded-lg border p-4"
            style={{
              borderColor: "var(--border-default)",
              backgroundColor: "var(--bg-surface)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {rec.company_name}
              </span>
              <span className="text-xs font-medium" style={{ color: style.color }}>
                {style.label}
              </span>
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {rec.role} · {rec.country} · Desde {rec.date}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
