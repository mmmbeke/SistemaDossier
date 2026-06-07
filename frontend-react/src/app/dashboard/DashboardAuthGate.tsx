"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getStoredAccessToken } from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";

/**
 * Exige sesión (JWT en localStorage o sessionStorage) para ver el dashboard.
 * Evita entrar por URL directa sin haber iniciado sesión.
 */
export default function DashboardAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      const next = pathname && pathname.startsWith("/dashboard") ? pathname : "/dashboard";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setAllowed(true);
  }, [router, pathname]);

  if (!allowed) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ backgroundColor: "var(--bg-page)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("auth.gate_checking")}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
