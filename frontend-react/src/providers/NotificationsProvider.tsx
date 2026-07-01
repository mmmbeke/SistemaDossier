"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchDossiersFromApi,
  getStoredAccessToken,
  isDossierFolderEntry,
  type DossierListEntry,
} from "@/lib/dossier-api";

const STORAGE_KEY = "dossier_notifications_v1";
const BASELINE_KEY = "dossier_notifications_baseline_v1";
const POLL_MS = 15000;
const MAX_NOTIFICATIONS = 40;

export type DossierNotification = {
  id: string;
  kind: "dossier" | "folder";
  title: string;
  status: string;
  createdAt: string;
  href: string;
  /** `manual` (lo pidió el usuario) o `automated` (calendario / automatización). */
  origin: "manual" | "automated";
  read: boolean;
};

type NotificationsContextValue = {
  notifications: DossierNotification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
  refresh: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function loadStored(): DossierNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (n): n is DossierNotification =>
        typeof n === "object" && n !== null && typeof (n as DossierNotification).id === "string",
    );
  } catch {
    return [];
  }
}

function saveStored(list: DossierNotification[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_NOTIFICATIONS)));
  } catch {
    /* ignore */
  }
}

function loadBaseline(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(BASELINE_KEY);
  } catch {
    return null;
  }
}

function saveBaseline(iso: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BASELINE_KEY, iso);
  } catch {
    /* ignore */
  }
}

function entryToNotification(entry: DossierListEntry): DossierNotification | null {
  if (isDossierFolderEntry(entry)) {
    if (!entry.created_at) return null;
    // Las carpetas agrupan dossiers de un evento de calendario → siempre automatizadas.
    return {
      id: `folder:${entry.id}`,
      kind: "folder",
      title: entry.title || entry.calendar_meeting || "Reunión",
      status: entry.status,
      createdAt: entry.created_at,
      href: `/dashboard/dossiers/folder/${entry.id}`,
      origin: "automated",
      read: false,
    };
  }
  if (!entry.created_at) return null;
  const origin: "manual" | "automated" =
    entry.trigger_source && entry.trigger_source !== "manual" ? "automated" : "manual";
  return {
    id: `dossier:${entry.id}`,
    kind: "dossier",
    title: entry.subject_name || entry.calendar_meeting || "Dossier",
    status: entry.status,
    createdAt: entry.created_at,
    href: `/dashboard/dossiers/${entry.id}`,
    origin,
    read: false,
  };
}

function maxCreatedAt(list: DossierNotification[]): string {
  return list.reduce((max, n) => (n.createdAt > max ? n.createdAt : max), "1970-01-01T00:00:00Z");
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<DossierNotification[]>([]);
  const baselineRef = useRef<string | null>(null);

  useEffect(() => {
    setNotifications(loadStored());
    baselineRef.current = loadBaseline();
  }, []);

  const poll = useCallback(async () => {
    if (!getStoredAccessToken()) return;
    let entries: DossierListEntry[];
    try {
      const res = await fetchDossiersFromApi(25);
      entries = res.items ?? [];
    } catch {
      return;
    }

    const fresh = entries
      .map(entryToNotification)
      .filter((n): n is DossierNotification => n !== null);

    if (baselineRef.current === null) {
      const baseline = fresh.length ? maxCreatedAt(fresh) : new Date().toISOString();
      baselineRef.current = baseline;
      saveBaseline(baseline);
      return;
    }

    const baseline = baselineRef.current;
    setNotifications((prev) => {
      const known = new Set(prev.map((n) => n.id));
      const toAdd = fresh
        .filter((n) => !known.has(n.id) && n.createdAt > baseline)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      if (toAdd.length === 0) return prev;
      const merged = [...toAdd, ...prev].slice(0, MAX_NOTIFICATIONS);
      saveStored(merged);
      return merged;
    });
  }, []);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [poll]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.read ? n : { ...n, read: true }));
      saveStored(next);
      return next;
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      saveStored(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    saveStored([]);
  }, []);

  const unreadCount = useMemo(
    () => notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
    [notifications],
  );

  const value = useMemo(
    () => ({ notifications, unreadCount, markAllRead, markRead, clearAll, refresh: poll }),
    [notifications, unreadCount, markAllRead, markRead, clearAll, poll],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications debe usarse dentro de NotificationsProvider");
  }
  return ctx;
}
