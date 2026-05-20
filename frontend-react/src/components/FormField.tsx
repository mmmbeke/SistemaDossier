import type { InputHTMLAttributes } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export default function FormField({
  label,
  error,
  hint,
  id,
  ...inputProps
}: FormFieldProps) {
  const inputId = id ?? inputProps.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </label>
      <input
        id={inputId}
        {...inputProps}
        className="w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition focus:ring-2"
        style={{
          backgroundColor: "var(--bg-input)",
          borderColor: error ? "#ef4444" : "var(--border-default)",
          color: "var(--text-primary)",
        }}
      />
      {error ? (
        <span className="text-xs text-red-400">{error}</span>
      ) : hint ? (
        <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
