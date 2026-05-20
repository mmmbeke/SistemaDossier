import type { Alert } from "@/lib/mock-dossiers";

function AlertItem({ alert }: { alert: Alert }) {
  const isCritical = alert.level === "critical";
  const bgColor = isCritical
    ? "rgba(239, 68, 68, 0.10)"
    : "rgba(251, 191, 36, 0.10)";
  const borderColor = isCritical
    ? "rgba(239, 68, 68, 0.30)"
    : "rgba(251, 191, 36, 0.30)";
  const iconColor = isCritical ? "#ef4444" : "#fbbf24";

  return (
    <div
      className="flex gap-3 rounded-lg border p-4"
      style={{ borderColor, backgroundColor: bgColor }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: bgColor, color: iconColor }}
      >
        {isCritical ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: iconColor }}
        >
          {isCritical ? "Crítico" : "Advertencia"}
        </span>
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          {alert.message}
        </p>
        {alert.source && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Fuente: {alert.source}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div
        className="flex items-center gap-3 rounded-lg border p-4"
        style={{
          borderColor: "rgba(52, 211, 153, 0.25)",
          backgroundColor: "rgba(52, 211, 153, 0.08)",
        }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{
            backgroundColor: "rgba(52, 211, 153, 0.10)",
            color: "#34d399",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold" style={{ color: "#34d399" }}>
            Sin alertas activas
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            No se detectaron señales de riesgo en las fuentes consultadas.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {alerts.map((alert, idx) => (
        <AlertItem key={idx} alert={alert} />
      ))}
    </div>
  );
}
