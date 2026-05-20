type ComingSoonProps = {
  phase: string;
  description: string;
};

export default function ComingSoon({ phase, description }: ComingSoonProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-xl border px-6 py-20 text-center"
      style={{
        borderColor: "var(--border-default)",
        backgroundImage:
          "linear-gradient(180deg, var(--bg-card-start) 0%, var(--bg-card-end) 100%)",
      }}
    >
      <span
        className="rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider"
        style={{
          backgroundColor: "var(--bg-surface-strong)",
          color: "var(--accent-from)",
        }}
      >
        {phase}
      </span>
      <h2
        className="text-2xl font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        Próximamente
      </h2>
      <p className="max-w-md text-sm" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>
    </div>
  );
}
