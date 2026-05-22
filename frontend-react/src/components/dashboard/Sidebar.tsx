"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import {
  fetchAuthMe,
  getAuthTokenStorageMode,
  getStoredAccessToken,
  readDossierUserPreview,
  writeDossierUserPreview,
} from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";

type NavItem = {
  href: string;
  labelKey: "nav.overview" | "nav.automation" | "nav.dossiers" | "nav.settings";
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    labelKey: "nav.overview",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: "/dashboard/automation",
    labelKey: "nav.automation",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    href: "/dashboard/dossiers",
    labelKey: "nav.dossiers",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    labelKey: "nav.settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

function initialsFromProfile(fullName: string, email: string): string {
  const n = fullName.trim();
  if (n.length >= 1) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0][0];
      const b = parts[parts.length - 1][0];
      if (a && b) return (a + b).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const e = email.trim();
  if (e.length >= 2) return e.slice(0, 2).toUpperCase();
  return "?";
}

type FooterProfile = { initials: string; name: string; detail: string };

const DEMO_FOOTER: FooterProfile = {
  initials: "JD",
  name: "John Doe",
  detail: "",
};

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [footer, setFooter] = useState<FooterProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const preview = readDossierUserPreview();
      if (preview) {
        const initials = initialsFromProfile(preview.full_name, preview.email);
        const name = preview.full_name.trim() || preview.email;
        const detail = preview.company_name?.trim() || preview.email;
        if (!cancelled) setFooter({ initials, name, detail });
        return;
      }

      const token = getStoredAccessToken();
      if (token) {
        try {
          const me = await fetchAuthMe();
          writeDossierUserPreview(
            {
              email: me.email,
              full_name: me.full_name,
              company_name: me.company_name,
            },
            getAuthTokenStorageMode()
          );
          const initials = initialsFromProfile(me.full_name, me.email);
          const name = me.full_name.trim() || me.email;
          const detail = me.company_name?.trim() || me.email;
          if (!cancelled) setFooter({ initials, name, detail });
        } catch {
          if (!cancelled)
            setFooter({
              initials: "?",
              name: t("auth.error.server"),
              detail: t("user.plan"),
            });
        }
        return;
      }

      if (!cancelled)
        setFooter({
          ...DEMO_FOOTER,
          detail: t("user.plan"),
        });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const display = footer ?? { ...DEMO_FOOTER, detail: t("user.plan") };

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col"
      style={{
        backgroundImage:
          "linear-gradient(180deg, var(--bg-sidebar-start) 0%, var(--bg-sidebar-end) 100%)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="flex items-center px-5 py-6"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <Link href="/dashboard">
          <BrandLogo size="md" />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition"
                  style={{
                    color: active
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    backgroundColor: active
                      ? "var(--bg-surface-strong)"
                      : "transparent",
                  }}
                >
                  {item.icon}
                  <span>{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        className="px-4 py-4"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
            }}
          >
            {display.initials}
          </div>
          <div className="min-w-0 flex-1 flex flex-col">
            <span
              className="truncate text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
              title={display.name}
            >
              {display.name}
            </span>
            <span
              className="truncate text-xs"
              style={{ color: "var(--text-muted)" }}
              title={display.detail}
            >
              {display.detail}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
