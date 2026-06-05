"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/dashboard/TopBar";
import AddressBookPanel from "@/components/settings/AddressBookPanel";
import BillingPanel from "@/components/settings/BillingPanel";
import CompanyContextPanel from "@/components/settings/CompanyContextPanel";
import GeneralPanel from "@/components/settings/GeneralPanel";
import LanguagePanel from "@/components/settings/LanguagePanel";
import NotificationsPanel from "@/components/settings/NotificationsPanel";
import SettingsNav, {
  type SettingsSection,
} from "@/components/settings/SettingsNav";
import { fetchAuthMe, getStoredAccessToken, readDossierUserPreview } from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";

export default function SettingsPage() {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSection>("billing");
  const [workspaceKind, setWorkspaceKind] = useState<"personal" | "work" | null>(null);

  useEffect(() => {
    const preview = readDossierUserPreview();
    if (preview?.workspace_kind === "personal" || preview?.workspace_kind === "work") {
      setWorkspaceKind(preview.workspace_kind);
    }
    if (!getStoredAccessToken()) {
      return;
    }
    let cancelled = false;
    void fetchAuthMe()
      .then((me) => {
        if (cancelled) return;
        setWorkspaceKind(me.workspace_kind === "personal" ? "personal" : "work");
      })
      .catch(() => {
        /* mantener preview o null */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (workspaceKind === "personal" && section === "company") {
      setSection("general");
    }
  }, [workspaceKind, section]);

  return (
    <>
      <TopBar
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <SettingsNav active={section} onChange={setSection} workspaceKind={workspaceKind} />

        <div>
          {section === "general" && <GeneralPanel />}
          {section === "company" && workspaceKind !== "personal" && <CompanyContextPanel />}
          {section === "language" && <LanguagePanel />}
          {section === "billing" && <BillingPanel />}
          {section === "addressbook" && <AddressBookPanel />}
          {section === "notifications" && <NotificationsPanel />}
        </div>
      </div>
    </>
  );
}
