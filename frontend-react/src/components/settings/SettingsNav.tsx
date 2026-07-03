"use client";

import { useMemo } from "react";
import { useTranslation } from "@/providers/PreferencesProvider";
import type { TranslationKey } from "@/i18n/types";

export type SettingsSection =
  | "general"
  | "company"
  | "language"
  | "billing"
  | "addressbook"
  | "notifications";

type NavItem = {
  id: SettingsSection;
  labelKey: TranslationKey;
};

const items: NavItem[] = [
  { id: "general", labelKey: "settings.nav_general" },
  { id: "company", labelKey: "settings.nav_company" },
  { id: "language", labelKey: "settings.nav_language" },
  { id: "billing", labelKey: "settings.nav_billing" },
  { id: "addressbook", labelKey: "settings.nav_addressbook" },
  { id: "notifications", labelKey: "settings.nav_notifications" },
];

type SettingsNavProps = {
  active: SettingsSection;
  onChange: (section: SettingsSection) => void;
  /** Si es `personal`, no se muestra el apartado de contexto de empresa. */
  workspaceKind?: "personal" | "work" | null;
};

export default function SettingsNav({
  active,
  onChange,
  workspaceKind,
}: SettingsNavProps) {
  const { t } = useTranslation();

  const visibleItems = useMemo(() => {
    if (workspaceKind === "personal") {
      return items.filter((i) => i.id !== "company");
    }
    return items;
  }, [workspaceKind]);

  return (
    <nav
      className="flex flex-col gap-1 rounded-xl border p-2"
      style={{
        borderColor: "var(--border-default)",
        backgroundColor: "var(--bg-surface)",
      }}
    >
      {visibleItems.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "ui-settings-nav-btn ui-settings-nav-btn--active"
                : "ui-settings-nav-btn ui-settings-nav-btn--inactive"
            }
          >
            {t(item.labelKey)}
          </button>
        );
      })}
    </nav>
  );
}
