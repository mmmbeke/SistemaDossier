"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clearAuthSession,
  DossierApiError,
  fetchAuthMe,
  getStoredAccessToken,
} from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";

/**
 * Exige sesión (JWT en localStorage o sessionStorage) para ver el dashboard.
 * Valida el token contra la API; si está expirado o es inválido, fuerza nuevo login.
 */
export default function DashboardAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const token = getStoredAccessToken();
      const next = pathname && pathname.startsWith("/dashboard") ? pathname : "/dashboard";
      if (!token) {
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      try {
        await fetchAuthMe();
        if (!cancelled) setAllowed(true);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DossierApiError && e.status === 401) {
          clearAuthSession();
          router.replace(
            `/login?next=${encodeURIComponent(next)}&reason=session_expired`
          );
          return;
        }
        // Red u otro error: dejar entrar; las vistas mostrarán su propio aviso.
        setAllowed(true);
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
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
