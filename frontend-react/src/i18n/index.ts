import de from "@/i18n/messages/de";
import en from "@/i18n/messages/en";
import enGb from "@/i18n/messages/en-gb";
import es from "@/i18n/messages/es";
import fr from "@/i18n/messages/fr";
import it from "@/i18n/messages/it";
import pt from "@/i18n/messages/pt";
import type { Locale, TranslationKey } from "@/i18n/types";

const dictionaries: Record<Locale, Record<string, string>> = {
  en,
  "en-gb": enGb,
  es,
  pt,
  it,
  fr,
  de,
};

export function getDictionary(locale: Locale): Record<string, string> {
  const dict = dictionaries[locale] ?? dictionaries.en;
  return { ...dictionaries.en, ...dict };
}

export function createTranslator(locale: Locale) {
  const dict = getDictionary(locale);

  return function t(
    key: TranslationKey,
    params?: Record<string, string | number>
  ): string {
    let text = dict[key] ?? dictionaries.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  };
}

export type TranslateFn = ReturnType<typeof createTranslator>;
