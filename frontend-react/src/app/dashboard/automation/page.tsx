"use client";

import { useState } from "react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import TopBar from "@/components/dashboard/TopBar";
import Toggle from "@/components/ui/Toggle";
import { useTranslation } from "@/providers/PreferencesProvider";
import type { TranslationKey } from "@/i18n/types";

type CalendarProvider = "google" | "outlook";

type CalendarAccount = {
  id: string;
  provider: CalendarProvider;
  nameKey: TranslationKey;
  email: string;
  connected: boolean;
  autoGenerate: boolean;
};

const selectClass =
  "w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:ring-2";

const selectStyle = {
  backgroundColor: "var(--bg-input)",
  borderColor: "var(--border-default)",
  color: "var(--text-primary)",
};

const BEFORE_OPTIONS: { value: string; key: TranslationKey }[] = [
  { value: "15", key: "time.15_min" },
  { value: "30", key: "time.30_min" },
  { value: "60", key: "time.1_hour" },
  { value: "120", key: "time.2_hours" },
  { value: "1440", key: "time.1_day" },
];

const DEPTH_OPTIONS: { value: string; key: TranslationKey }[] = [
  { value: "basic", key: "depth.basic" },
  { value: "standard", key: "depth.standard" },
  { value: "deep", key: "depth.deep" },
];

const PARTICIPANT_OPTIONS: { value: string; key: TranslationKey }[] = [
  { value: "1", key: "participants.1" },
  { value: "2", key: "participants.2" },
  { value: "3", key: "participants.3" },
];

function ProviderIcon({ provider }: { provider: CalendarProvider }) {
  const label = provider === "google" ? "G" : "O";
  const bg =
    provider === "google"
      ? "linear-gradient(135deg, #4285f4, #34a853)"
      : "linear-gradient(135deg, #0078d4, #005a9e)";
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
      style={{ backgroundImage: bg }}
    >
      {label}
    </div>
  );
}

function DomainTags({
  tags,
  variant,
  onAdd,
  onRemove,
}: {
  tags: string[];
  variant: "always" | "never";
  onAdd: (domain: string) => void;
  onRemove: (domain: string) => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");

  function handleAdd() {
    const d = input.trim().toLowerCase();
    if (!d || tags.includes(d)) return;
    onAdd(d);
    setInput("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
            style={{
              borderColor:
                variant === "never"
                  ? "rgba(239, 68, 68, 0.35)"
                  : "var(--border-default)",
              backgroundColor:
                variant === "never"
                  ? "rgba(239, 68, 68, 0.08)"
                  : "var(--bg-surface-strong)",
              color: "var(--text-secondary)",
            }}
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemove(tag)}
              className="opacity-70 hover:opacity-100"
              aria-label={tag}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
          placeholder="domain.com"
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          style={selectStyle}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-lg border px-3 py-2 text-sm font-medium"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-primary)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          {t("domain.add")}
        </button>
      </div>
    </div>
  );
}

export default function AutomationPage() {
  const { t } = useTranslation();

  const [calendars, setCalendars] = useState<CalendarAccount[]>([
    {
      id: "g-work",
      provider: "google",
      nameKey: "calendar.work",
      email: "john.doe@company.com",
      connected: true,
      autoGenerate: true,
    },
    {
      id: "g-personal",
      provider: "google",
      nameKey: "calendar.personal",
      email: "johndoe@gmail.com",
      connected: true,
      autoGenerate: false,
    },
    {
      id: "o-work",
      provider: "outlook",
      nameKey: "calendar.outlook_work",
      email: "j.doe@enterprise.com",
      connected: false,
      autoGenerate: false,
    },
  ]);

  const [beforeMinutes, setBeforeMinutes] = useState("30");
  const [defaultDepth, setDefaultDepth] = useState("standard");
  const [minParticipants, setMinParticipants] = useState("1");
  const [skipInternal, setSkipInternal] = useState(true);
  const [skipRecurring, setSkipRecurring] = useState(false);

  const [alwaysDomains, setAlwaysDomains] = useState([
    "sequoia.com",
    "a16z.com",
  ]);
  const [neverDomains, setNeverDomains] = useState([
    "company.com",
    "personal.com",
  ]);

  const [emailProvider, setEmailProvider] = useState("gmail");
  const [sendBeforeMeeting, setSendBeforeMeeting] = useState(true);
  const [ccAssistant, setCcAssistant] = useState(false);
  const [assistantEmail, setAssistantEmail] = useState("");

  function toggleCalendarAuto(id: string, value: boolean) {
    setCalendars((prev) =>
      prev.map((c) => (c.id === id ? { ...c, autoGenerate: value } : c))
    );
  }

  function connectCalendar(id: string) {
    setCalendars((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, connected: true, autoGenerate: true } : c
      )
    );
  }

  return (
    <>
      <TopBar
        title={t("automation.title")}
        subtitle={t("automation.subtitle")}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardCard
          title={t("automation.connected_calendars")}
          action={
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-xs font-medium"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              {t("automation.add_calendar")}
            </button>
          }
        >
          <ul className="flex flex-col gap-3">
            {calendars.map((cal) => (
              <li
                key={cal.id}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-surface)",
                  opacity: cal.connected ? 1 : 0.85,
                }}
              >
                <div className="flex flex-1 items-center gap-3">
                  <ProviderIcon provider={cal.provider} />
                  <div className="flex flex-col">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {t(cal.nameKey)}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {cal.email}
                    </span>
                  </div>
                </div>

                {cal.connected ? (
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: "rgba(52, 211, 153, 0.10)",
                      color: "#34d399",
                    }}
                  >
                    {t("status.connected")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => connectCalendar(cal.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                    style={{
                      backgroundImage:
                        "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
                    }}
                  >
                    {t("btn.connect")}
                  </button>
                )}

                <Toggle
                  label={t("toggle.auto_generate")}
                  checked={cal.autoGenerate}
                  disabled={!cal.connected}
                  onChange={(v) => toggleCalendarAuto(cal.id, v)}
                />
              </li>
            ))}
          </ul>
        </DashboardCard>

        <DashboardCard title={t("automation.rules_title")}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>
                  {t("automation.before_meeting")}
                </span>
                <select
                  value={beforeMinutes}
                  onChange={(e) => setBeforeMinutes(e.target.value)}
                  className={selectClass}
                  style={selectStyle}
                >
                  {BEFORE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.key)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>
                  {t("automation.research_depth")}
                </span>
                <select
                  value={defaultDepth}
                  onChange={(e) => setDefaultDepth(e.target.value)}
                  className={selectClass}
                  style={selectStyle}
                >
                  {DEPTH_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.key)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-sm">
              <span style={{ color: "var(--text-secondary)" }}>
                {t("automation.min_participants")}
              </span>
              <select
                value={minParticipants}
                onChange={(e) => setMinParticipants(e.target.value)}
                className={selectClass}
                style={selectStyle}
              >
                {PARTICIPANT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.key)}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-3">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
                <input
                  type="checkbox"
                  checked={skipInternal}
                  onChange={(e) => setSkipInternal(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                {t("automation.skip_internal")}
              </label>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
                <input
                  type="checkbox"
                  checked={skipRecurring}
                  onChange={(e) => setSkipRecurring(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                {t("automation.skip_recurring")}
              </label>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title={t("automation.domain_rules")}>
          <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
            {t("automation.domain_desc")}
          </p>
          <div className="flex flex-col gap-6">
            <div>
              <h4
                className="mb-2 text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {t("domain.always")}
              </h4>
              <DomainTags
                tags={alwaysDomains}
                variant="always"
                onAdd={(d) => setAlwaysDomains((prev) => [...prev, d])}
                onRemove={(d) =>
                  setAlwaysDomains((prev) => prev.filter((x) => x !== d))
                }
              />
            </div>
            <div>
              <h4
                className="mb-2 text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {t("domain.never")}
              </h4>
              <DomainTags
                tags={neverDomains}
                variant="never"
                onAdd={(d) => setNeverDomains((prev) => [...prev, d])}
                onRemove={(d) =>
                  setNeverDomains((prev) => prev.filter((x) => x !== d))
                }
              />
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title={t("automation.email_title")}>
          <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
            {t("automation.email_desc")}
          </p>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span style={{ color: "var(--text-secondary)" }}>
                {t("settings.email_provider")}
              </span>
              <select
                value={emailProvider}
                onChange={(e) => setEmailProvider(e.target.value)}
                className={selectClass}
                style={selectStyle}
              >
                <option value="gmail">{t("provider.gmail")}</option>
                <option value="outlook">{t("provider.outlook")}</option>
                <option value="smtp">{t("provider.smtp")}</option>
              </select>
            </label>

            <div
              className="flex items-center justify-between rounded-lg border px-4 py-3"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              <div className="flex flex-col">
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t("mail.send_before")}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("automation.timing_desc")}
                </span>
              </div>
              <Toggle
                checked={sendBeforeMeeting}
                onChange={setSendBeforeMeeting}
              />
            </div>

            <div
              className="flex flex-col gap-3 rounded-lg border px-4 py-3"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {t("mail.cc_assistant")}
                  </span>
                </div>
                <Toggle checked={ccAssistant} onChange={setCcAssistant} />
              </div>
              {ccAssistant && (
                <input
                  type="email"
                  value={assistantEmail}
                  onChange={(e) => setAssistantEmail(e.target.value)}
                  placeholder="assistant@company.com"
                  className="rounded-lg border px-3 py-2 text-sm outline-none"
                  style={selectStyle}
                />
              )}
            </div>
          </div>
        </DashboardCard>
      </div>
    </>
  );
}
