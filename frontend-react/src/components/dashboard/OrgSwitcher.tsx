"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DossierApiError,
  fetchMyOrganizations,
  getStoredAccessToken,
  switchActiveOrganization,
  writeDossierUserPreview,
  getAuthTokenStorageMode,
  type UserOrganizationItem,
} from "@/lib/dossier-api";
import {
  AUTH_ME_CHANGED_EVENT,
  notifyAuthMeChanged,
  setAuthMeCache,
} from "@/hooks/useAuthMe";
import { useTranslation } from "@/providers/PreferencesProvider";

function orgLabel(
  item: UserOrganizationItem,
  personalLabel: string
): string {
  if (item.workspace_kind === "personal") return personalLabel;
  return item.organization_name.trim() || personalLabel;
}

export default function OrgSwitcher() {
  const { t } = useTranslation();
  const router = useRouter();
  const [orgs, setOrgs] = useState<UserOrganizationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setOrgs([]);
      return;
    }
    try {
      const res = await fetchMyOrganizations();
      setOrgs(res.items);
    } catch {
      setOrgs([]);
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(AUTH_ME_CHANGED_EVENT, load);
    return () => window.removeEventListener(AUTH_ME_CHANGED_EVENT, load);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  if (orgs.length < 2) return null;

  const active = orgs.find((o) => o.is_active) ?? orgs[0];
  const personalLabel = t("workspace.personal");

  async function handleSwitch(item: UserOrganizationItem) {
    if (busy || item.is_active) {
      setOpen(false);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const data = await switchActiveOrganization(item.organization_id);
      writeDossierUserPreview(
        {
          email: data.user.email,
          full_name: data.user.full_name,
          company_name: data.user.company_name,
          workspace_kind: data.user.workspace_kind,
          is_platform_admin: !!data.user.is_platform_admin,
        },
        getAuthTokenStorageMode()
      );
      setAuthMeCache(data.user);
      notifyAuthMeChanged();
      setOpen(false);
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof DossierApiError ? e.message : t("org_switcher.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={menuRef} className="relative px-3 pt-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ui-hover-surface"
        style={{
          borderColor: "var(--border-default)",
          backgroundColor: "var(--bg-surface)",
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
            {t("org_switcher.label")}
          </span>
          <span className="truncate font-medium" style={{ color: "var(--text-primary)" }}>
            {orgLabel(active, personalLabel)}
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--text-muted)" }}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {error ? (
        <p className="mt-1 px-1 text-xs" style={{ color: "var(--accent-danger, #f87171)" }}>
          {error}
        </p>
      ) : null}

      {open ? (
        <div
          className="absolute left-3 right-3 z-50 mt-1 overflow-hidden rounded-lg border py-1 shadow-xl"
          role="menu"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-surface)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {orgs.map((item) => (
            <button
              key={item.organization_id}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void handleSwitch(item)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ui-hover-surface disabled:opacity-50"
              style={{ color: "var(--text-primary)" }}
            >
              <span className="truncate">{orgLabel(item, personalLabel)}</span>
              {item.is_active ? (
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="shrink-0"
                  style={{ color: "var(--brand-cyan)" }}
                  aria-hidden
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
