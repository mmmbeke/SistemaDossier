/**
 * Traduce textos emitidos por el backend (español fijo) al locale de la UI.
 * Preferir códigos estructurados en la API; esto cubre mensajes legados.
 */
import type { TranslateFn } from "@/i18n";
import type { TranslationKey } from "@/i18n/types";
import type { DossierApiError } from "@/lib/dossier-api";
import { translatePdlWarning } from "@/lib/translate-pdl-warning";

import { translateApiError } from "@/lib/translate-api-error";

const EXACT_STATUS: Record<string, TranslationKey> = {
  "Error en el informe generado.": "backend.status_report_error",
  "Error en síntesis o en el pipeline.": "backend.status_pipeline_error",
  "Error al generar el análisis de persona.": "backend.status_person_analysis_error",
  "Cancelado por el usuario": "backend.status_cancelled_by_user",
  "No se pudo generar el análisis de persona. Reintenta la generación o usa «Nueva búsqueda de persona» con más datos.":
    "backend.status_person_retry_hint",
};

const EXACT_API_MESSAGE: Record<string, TranslationKey> = {
  "Ya existe una cuenta con este email. Prueba a iniciar sesión.":
    "backend.error_email_exists",
  "La invitación ya no es válida.": "backend.error_invite_invalid",
  "Debes registrarte con el correo al que se envió la invitación.":
    "backend.error_invite_email_mismatch",
  "No hay sesión. Inicia sesión de nuevo.": "backend.error_no_session",
  "Créditos insuficientes: se requieren {cost} y la organización tiene {balance}.":
    "backend.error_insufficient_credits",
  "Job no encontrado.": "backend.error_job_not_found",
  "Locale no soportado.": "backend.error_locale_unsupported",
};

const PREFIX_API: { prefix: string; key: TranslationKey }[] = [
  { prefix: "Créditos insuficientes:", key: "backend.error_insufficient_credits_generic" },
  { prefix: "Los dossiers de empresa requieren plan", key: "billing.corporate_requires_pro" },
  { prefix: "La automatización de calendario requiere plan", key: "billing.automation_requires_pro" },
  { prefix: "Tu plan ", key: "backend.error_plan_depth" },
];

export function translateDossierStatusMessage(
  raw: string | null | undefined,
  t: TranslateFn,
): string | null {
  if (!raw?.trim()) return null;
  const msg = raw.trim();
  const exact = EXACT_STATUS[msg];
  if (exact) return t(exact);
  return translateBackendWarning(msg, t);
}

/** Avisos PDL/DeepSeek y otros warnings del pipeline de persona. */
export function translateBackendWarning(warning: string, t: TranslateFn): string {
  const w = warning.trim();
  if (!w) return w;
  const pdl = translatePdlWarning(w, t);
  if (pdl !== w) return pdl;
  const exact = EXACT_STATUS[w];
  if (exact) return t(exact);
  return w;
}

export function translateApiErrorMessage(
  err: DossierApiError | string,
  t: TranslateFn,
): string {
  if (typeof err === "string") {
    return translateLegacyApiMessage(err, t);
  }
  const translated = translateApiError(err, t);
  if (translated !== err.message) return translated;
  return translateLegacyApiMessage(err.message, t);
}

function translateLegacyApiMessage(message: string, t: TranslateFn): string {
  const msg = message.trim();
  if (!msg) return msg;
  const exact = EXACT_API_MESSAGE[msg];
  if (exact) return t(exact);
  for (const { prefix, key } of PREFIX_API) {
    if (msg.startsWith(prefix)) return t(key);
  }
  const creditsMatch = msg.match(
    /^Créditos insuficientes: se requieren (\d+) y la organización tiene (\d+)\.$/,
  );
  if (creditsMatch) {
    return t("backend.error_insufficient_credits", {
      cost: creditsMatch[1],
      balance: creditsMatch[2],
    });
  }
  return msg;
}

export { translateApiError };
