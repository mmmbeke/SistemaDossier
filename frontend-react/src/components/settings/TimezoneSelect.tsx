"use client";

import type { Locale, TranslationKey } from "@/i18n/types";
import {
  SYSTEM_TIMEZONE_VALUE,
  formatBrowserTimezoneHint,
  formatGeneralTimezoneLabel,
  getBrowserTimezone,
  getGeneralTimezoneOptions,
} from "@/lib/timezones";

type Props = {
  id?: string;
  name?: string;
  timezone: string;
  followSystem: boolean;
  onChange: (next: { timezone: string; followSystem: boolean }) => void;
  locale: Locale;
  systemLabel: string;
  t: (key: TranslationKey, params?: Record<string, string>) => string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  disabled?: boolean;
};

export default function TimezoneSelect({
  id,
  name,
  timezone,
  followSystem,
  onChange,
  locale,
  systemLabel,
  t,
  className,
  style,
  title,
  disabled,
}: Props) {
  const options = getGeneralTimezoneOptions(
    followSystem ? [] : [timezone].filter(Boolean),
  );
  const selected = followSystem ? SYSTEM_TIMEZONE_VALUE : timezone;
  const systemHint = formatBrowserTimezoneHint(locale);

  return (
    <select
      id={id}
      name={name}
      value={selected}
      title={title}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (v === SYSTEM_TIMEZONE_VALUE) {
          onChange({ timezone: getBrowserTimezone(), followSystem: true });
        } else {
          onChange({ timezone: v, followSystem: false });
        }
      }}
      className={className}
      style={style}
    >
      <option value={SYSTEM_TIMEZONE_VALUE}>
        {systemLabel.replace("{hint}", systemHint)}
      </option>
      {options.map(({ value, labelKey }) => (
        <option key={value} value={value}>
          {labelKey
            ? formatGeneralTimezoneLabel(value, locale, t(labelKey))
            : formatGeneralTimezoneLabel(value, locale, value.replace(/_/g, " "))}
        </option>
      ))}
    </select>
  );
}
