/** Langues supportées pour l'UI et la traduction chat */
export const SUPPORTED_LOCALES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
  { code: "ru", label: "Русский" },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["code"];

export const DEFAULT_LOCALE: SupportedLocale = "fr";

/** Locale inconnue / non déclarée */
export const UND_LOCALE = "und";

export function isSupportedLocale(value: string): value is SupportedLocale {
  return SUPPORTED_LOCALES.some((l) => l.code === value);
}

export function localeLabel(code: string): string {
  return SUPPORTED_LOCALES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

/** Faut-il traduire ce message pour le lecteur ? */
export function shouldTranslateMessage(
  sourceLocale: string | undefined,
  targetLocale: string
): boolean {
  const src = sourceLocale?.trim() || UND_LOCALE;
  if (src === targetLocale) return false;
  if (src === UND_LOCALE) return targetLocale !== DEFAULT_LOCALE;
  return true;
}

/** Locale supportée ou défaut (`fr`). */
export function normalizeLocale(locale?: string): SupportedLocale {
  if (locale && isSupportedLocale(locale)) return locale;
  return DEFAULT_LOCALE;
}

/** Consignes de langue pour prompts de génération (fiche PJ, sections, etc.). */
export function buildGenerationLocaleRules(locale?: string): string {
  const loc = normalizeLocale(locale);
  const label = localeLabel(loc);
  if (loc === "fr") {
    return [
      "- Réponds UNIQUEMENT en français.",
      "- Tout le contenu narratif (rangs, historiques, descriptions, noms de sorts) doit être en français.",
      "- N'utilise pas l'anglais pour les libellés ou descriptions (pas « Background », pas de titres entièrement en anglais).",
      "- Les titres latins ou noms propres exotiques sont acceptés si l'authenticité médiévale l'exige ; privilégie une formulation française claire.",
    ].join("\n");
  }
  return `- Réponds UNIQUEMENT en ${label}.`;
}
