"use client";

import { useState } from "react";
import TopBar from "@/components/dashboard/TopBar";
import AddressBookPanel from "@/components/settings/AddressBookPanel";
import BillingPanel from "@/components/settings/BillingPanel";
import GeneralPanel from "@/components/settings/GeneralPanel";
import LanguagePanel from "@/components/settings/LanguagePanel";
import NotificationsPanel from "@/components/settings/NotificationsPanel";
import SettingsNav, {
  type SettingsSection,
} from "@/components/settings/SettingsNav";
import { useTranslation } from "@/providers/PreferencesProvider";

export default function SettingsPage() {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSection>("billing");

  return (
    <>
      <TopBar
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <SettingsNav active={section} onChange={setSection} />

        <div>
          {section === "general" && <GeneralPanel />}
          {section === "language" && <LanguagePanel />}
          {section === "billing" && <BillingPanel />}
          {section === "addressbook" && <AddressBookPanel />}
          {section === "notifications" && <NotificationsPanel />}
        </div>
      </div>
    </>
  );
}
