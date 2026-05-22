"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import AuthShell from "@/components/AuthShell";
import FormField from "@/components/FormField";
import PrimaryButton from "@/components/PrimaryButton";
import {
  authRegister,
  DossierApiError,
  persistAuthToken,
  writeDossierUserPreview,
} from "@/lib/dossier-api";
import { useTranslation } from "@/providers/PreferencesProvider";
import type { TranslationKey } from "@/i18n/types";

type Errors = {
  fullName?: string;
  company?: string;
  email?: string;
  password?: string;
  terms?: string;
};

const STRENGTH_KEYS: TranslationKey[] = [
  "auth.strength.very_weak",
  "auth.strength.weak",
  "auth.strength.fair",
  "auth.strength.strong",
];

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  /** Mensaje de error de la API (email duplicado, BD no lista, red, etc.). */
  const [formError, setFormError] = useState<string | null>(null);

  function passwordStrength(pwd: string): { score: 0 | 1 | 2 | 3 } {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
    return { score: Math.min(score, 3) as 0 | 1 | 2 | 3 };
  }

  const strength = passwordStrength(password);

  function validate(): Errors {
    const next: Errors = {};
    if (!fullName.trim()) next.fullName = t("auth.error.name_required");
    if (!company.trim()) next.company = t("auth.error.company_required");
    if (!email.trim()) {
      next.email = t("auth.error.email_required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = t("auth.error.email_invalid");
    }
    if (!password) {
      next.password = t("auth.error.password_required");
    } else if (password.length < 8) {
      next.password = t("auth.error.password_min_8");
    }
    if (!accepted) next.terms = t("auth.error.terms_required");
    return next;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validate();
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length > 0) return;

    setLoading(true);
    try {
      const data = await authRegister({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        company_name: company.trim(),
      });
      // Tras crear cuenta dejamos sesión iniciada (misma UX que "recuérdame" en login).
      persistAuthToken(data.access_token, true);
      writeDossierUserPreview(
        {
          email: data.user.email,
          full_name: data.user.full_name,
          company_name: data.user.company_name,
        },
        "local"
      );
      router.push("/dashboard");
    } catch (e) {
      if (e instanceof DossierApiError) {
        if (e.isNetworkError()) setFormError(t("auth.error.network"));
        else setFormError(e.message || t("auth.error.server"));
      } else {
        setFormError(t("auth.error.server"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle_credits")}
      footer={
        <>
          {t("auth.register.has_account")}{" "}
          <Link
            href="/login"
            className="font-semibold"
            style={{ color: "var(--accent-from)" }}
          >
            {t("auth.register.sign_in")}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {formError && (
          <p
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
            role="alert"
          >
            {formError}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label={t("auth.register.name")}
            name="fullName"
            placeholder="Maria Pérez"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={errors.fullName}
          />
          <FormField
            label={t("auth.register.company")}
            name="company"
            placeholder="Alloxentric"
            autoComplete="organization"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            error={errors.company}
          />
        </div>

        <FormField
          label={t("auth.register.email_corporate")}
          name="email"
          type="email"
          placeholder="tu@empresa.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />

        <div className="flex flex-col gap-1.5">
          <FormField
            label={t("auth.login.password")}
            name="password"
            type="password"
            placeholder={t("auth.register.password_placeholder")}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          {password && !errors.password && (
            <div className="flex items-center gap-2 text-xs">
              <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full transition-all ${
                    strength.score === 0
                      ? "w-1/12 bg-red-500"
                      : strength.score === 1
                      ? "w-1/3 bg-orange-500"
                      : strength.score === 2
                      ? "w-2/3 bg-yellow-500"
                      : "w-full bg-emerald-500"
                  }`}
                />
              </div>
              <span style={{ color: "var(--text-muted)" }}>
                {t(STRENGTH_KEYS[strength.score])}
              </span>
            </div>
          )}
        </div>

        <label
          className="flex items-start gap-2 text-sm cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border border-zinc-700"
          />
          <span>
            {t("auth.register.terms_prefix")}{" "}
            <Link
              href="/terms"
              className="font-medium"
              style={{ color: "var(--accent-from)" }}
            >
              {t("auth.register.terms_link")}
            </Link>{" "}
            {t("auth.register.and")}{" "}
            <Link
              href="/privacy"
              className="font-medium"
              style={{ color: "var(--accent-from)" }}
            >
              {t("auth.register.privacy_link")}
            </Link>
            .
          </span>
        </label>
        {errors.terms && (
          <span className="text-xs text-red-400">{errors.terms}</span>
        )}

        <PrimaryButton type="submit" loading={loading}>
          {t("auth.register.create_free")}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
