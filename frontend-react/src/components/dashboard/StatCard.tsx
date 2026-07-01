type StatCardProps = {
  value: string | number;
  label: string;
  trend?: string;
  trendVariant?: "default" | "positive" | "warning";
};

export default function StatCard({
  value,
  label,
  trend,
  trendVariant = "default",
}: StatCardProps) {
  const trendColor =
    trendVariant === "positive"
      ? "var(--status-success)"
      : trendVariant === "warning"
      ? "var(--status-warning)"
      : "var(--text-muted)";

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border p-5"
      style={{
        borderColor: "var(--border-default)",
        backgroundImage:
          "linear-gradient(180deg, var(--bg-card-start) 0%, var(--bg-card-end) 100%)",
      }}
    >
      <span
        className="text-3xl font-bold tracking-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </span>
      <span className="text-sm" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {trend && (
        <span className="text-xs font-medium" style={{ color: trendColor }}>
          {trend}
        </span>
      )}
    </div>
  );
}
