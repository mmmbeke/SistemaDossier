"use client";

import { useTranslation } from "@/providers/PreferencesProvider";
import type { TranslationKey } from "@/i18n/types";

export type SettingsSection =
  | "general"
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
  { id: "language", labelKey: "settings.nav_language" },
  { id: "billing", labelKey: "settings.nav_billing" },
  { id: "addressbook", labelKey: "settings.nav_addressbook" },
  { id: "notifications", labelKey: "settings.nav_notifications" },
];

type SettingsNavProps = {
  active: SettingsSection;
  onChange: (section: SettingsSection) => void;
};

export default function SettingsNav({ active, onChange }: SettingsNavProps) {
  const { t } = useTranslation();

  return (
    <nav
      className="flex flex-col gap-1 rounded-xl border p-2"
      style={{
        borderColor: "var(--border-default)",
        backgroundColor: "var(--bg-surface)",
      }}
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className="rounded-lg px-3 py-2.5 text-left text-sm font-medium transition"
            style={{
              backgroundColor: isActive
                ? "var(--bg-surface-strong)"
                : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {t(item.labelKey)}
          </button>
        );
      })}
    </nav>
  );
}
