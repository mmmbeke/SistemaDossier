"use client";

import { useEffect, useState } from "react";
import CalendarMeetingFormatGuide from "@/components/dashboard/CalendarMeetingFormatGuide";
import {
  DossierApiError,
  fetchGoogleCalendarEventos,
  fetchOutlookCalendarEventos,
  getStoredAccessToken,
  type CalendarProvider,
} from "@/lib/dossier-api";

type Props = {
  provider: CalendarProvider;
};

export default function CalendarFormatGuideAction({ provider }: Props) {
  const [connected, setConnected] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getStoredAccessToken()) {
      setConnected(false);
      setChecked(true);
      return;
    }

    const fetchEvents =
      provider === "google" ? fetchGoogleCalendarEventos : fetchOutlookCalendarEventos;

    void fetchEvents({ top: 1 })
      .then(() => setConnected(true))
      .catch((e) => {
        setConnected(!(e instanceof DossierApiError && e.status === 404));
      })
      .finally(() => setChecked(true));
  }, [provider]);

  if (!checked || !connected) return null;
  return <CalendarMeetingFormatGuide />;
}
