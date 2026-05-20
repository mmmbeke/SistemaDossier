import type { TranslateFn } from "@/i18n";
import type { TranslationKey } from "@/i18n/types";
import type { DossierBadge } from "@/lib/mock-dossiers";

const BADGE_LABEL_KEYS: Partial<Record<DossierBadge, TranslationKey>> = {
  "Serial Founder": "badge.label.serial_founder",
  "VC Backed": "badge.label.vc_backed",
};

export function translateBadge(badge: DossierBadge, t: TranslateFn): string {
  const key = BADGE_LABEL_KEYS[badge];
  return key ? t(key) : badge;
}
