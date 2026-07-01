"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useNotifications, type DossierNotification } from "@/providers/NotificationsProvider";
import { useTranslation } from "@/providers/PreferencesProvider";

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function statusTone(status: string): { dot: string; key: "ready" | "failed" | "pending" } {
  const s = (status || "").toLowerCase();
  if (s === "failed" || s === "error") return { dot: "var(--status-error)", key: "failed" };
  if (s === "complete" || s === "completed" || s === "ready") return { dot: "var(--status-success)", key: "ready" };
  return { dot: "var(--status-warning)", key: "pending" };
}

function NotificationRow({
  n,
  onClick,
}: {
  n: DossierNotification;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const tone = statusTone(n.status);

  return (
    <Link
      href={n.href}
      onClick={onClick}
      className="flex items-start gap-3 px-4 py-3 transition ui-hover-surface"
      style={{
        backgroundColor: n.read ? "var(--bg-panel)" : "var(--bg-panel-muted)",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      <span
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: tone.dot }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className="truncate text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {n.title}
          </span>
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              color: n.origin === "automated" ? "var(--alert-info-text)" : "var(--text-muted)",
              backgroundColor:
                n.origin === "automated" ? "var(--alert-info-bg)" : "var(--bg-input)",
            }}
          >
            {n.origin === "automated"
              ? t("notifications.automated")
              : t("notifications.manual")}
          </span>
        </span>
        <span className="mt-0.5 block text-xs" style={{ color: "var(--text-muted)" }}>
          {t(`notifications.status_${tone.key}`)}
          {n.createdAt ? ` · ${n.createdAt.slice(0, 16).replace("T", " ")}` : ""}
        </span>
      </span>
    </Link>
  );
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next && unreadCount > 0) {
        // Al abrir, marcamos como leídas tras un instante para que el usuario vea el resaltado.
        window.setTimeout(() => markAllRead(), 1200);
      }
      return next;
    });
  }

  return (
    <div ref={containerRef} className="fixed right-6 top-4 z-50">
      <button
        type="button"
        onClick={toggle}
        aria-label={t("notifications.aria")}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border shadow-md transition ui-hover-surface"
        style={{
          borderColor: "var(--border-default)",
          backgroundColor: "var(--bg-panel)",
          color: "var(--text-primary)",
        }}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
            style={{ backgroundColor: "#ef4444" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border shadow-xl"
          style={{
            borderColor: "var(--border-strong)",
            backgroundColor: "var(--bg-panel)",
            boxShadow: "0 16px 40px rgba(10, 20, 40, 0.18)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{
              borderBottom: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-panel)",
            }}
          >
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("notifications.title")}
            </span>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={() => clearAll()}
                className="text-xs font-medium transition hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              >
                {t("notifications.clear_all")}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto" style={{ backgroundColor: "var(--bg-panel)" }}>
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                {t("notifications.empty")}
              </p>
            ) : (
              notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  onClick={() => {
                    markRead(n.id);
                    setOpen(false);
                  }}
                />
              ))
            )}
          </div>

          <Link
            href="/dashboard/dossiers"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-center text-xs font-medium transition ui-hover-surface"
            style={{
              color: "var(--accent-from)",
              borderTop: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-panel)",
            }}
          >
            {t("notifications.view_all")}
          </Link>
        </div>
      )}
    </div>
  );
}
