"use client";

import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { useTranslation } from "@/providers/PreferencesProvider";

export default function HomeClient() {
  const { t } = useTranslation();

  const phases = [
    { id: 0, status: "done" as const },
    { id: 1, status: "done" as const },
    { id: 2, status: "done" as const },
    { id: 3, status: "done" as const },
    { id: 4, status: "done" as const },
    { id: 5, status: "done" as const },
    { id: 6, status: "done" as const },
    { id: 7, status: "todo" as const },
    { id: 8, status: "todo" as const },
    { id: 9, status: "done" as const },
  ];

  return (
    <main
      className="flex flex-1 flex-col items-center justify-center px-6 py-16"
      style={{ backgroundColor: "var(--bg-page)" }}
    >
      <div className="w-full max-w-3xl">
        <header className="mb-10 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <BrandLogo size="md" />
            <div className="flex items-center gap-2 text-sm">
              <Link
                href="/login"
                className="rounded-lg px-4 py-2 font-medium transition hover:opacity-90"
                style={{ color: "var(--text-primary)" }}
              >
                {t("landing.login")}
              </Link>
              <Link
                href="/dashboard"
                className="rounded-lg px-4 py-2 font-semibold text-white transition hover:opacity-90"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
                }}
              >
                {t("landing.dashboard")}
              </Link>
            </div>
          </div>

          <span
            className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
            style={{
              borderColor: "var(--border-default)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-muted)",
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t("landing.badge")}
          </span>
          <h1
            className="text-5xl font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {t("landing.title")}
          </h1>
          <p className="max-w-xl text-base" style={{ color: "var(--text-muted)" }}>
            {t("landing.subtitle")}
          </p>
        </header>

        <section
          className="rounded-xl border p-6"
          style={{
            borderColor: "var(--border-default)",
            backgroundImage:
              "linear-gradient(180deg, var(--bg-card-start) 0%, var(--bg-card-end) 100%)",
          }}
        >
          <h2
            className="mb-4 text-sm font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            {t("landing.roadmap")}
          </h2>
          <ul className="flex flex-col gap-2">
            {phases.map((phase) => (
              <li
                key={phase.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-surface)",
                }}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="font-mono text-xs"
                    style={{ color: "var(--text-subtle)" }}
                  >
                    {t("landing.phase_label", { id: phase.id })}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {t(`phase.${phase.id}` as "phase.0")}
                  </span>
                </span>
                <span
                  className={
                    phase.status === "done"
                      ? "rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400"
                      : "rounded-full px-2.5 py-0.5 text-xs font-medium"
                  }
                  style={
                    phase.status === "done"
                      ? undefined
                      : {
                          backgroundColor: "var(--bg-surface-strong)",
                          color: "var(--text-subtle)",
                        }
                  }
                >
                  {phase.status === "done"
                    ? t("landing.done")
                    : t("landing.pending")}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <footer
          className="mt-10 text-xs"
          style={{ color: "var(--text-subtle)" }}
        >
          {t("landing.footer")}
        </footer>
      </div>
    </main>
  );
}
