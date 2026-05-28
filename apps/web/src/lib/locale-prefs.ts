import { DEFAULT_LOCALE, isSupportedLocale } from "@rpg-cr/shared";

const KEY_PREFIX = "rpg-cr-locale:";

export function loadLocaleBackup(playerId: string): string {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${playerId}`);
    if (raw && isSupportedLocale(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export function saveLocaleBackup(playerId: string, locale: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${KEY_PREFIX}${playerId}`, locale);
  } catch {
    /* ignore */
  }
}

/** Priorité backup local si PATCH locale pas encore reflété par le GET salon. */
export function resolveViewerLocale(
  playerId: string,
  serverLocale?: string
): string {
  const backup = loadLocaleBackup(playerId);
  if (serverLocale && isSupportedLocale(serverLocale)) {
    if (backup !== DEFAULT_LOCALE && backup !== serverLocale) return backup;
    return serverLocale;
  }
  return backup;
}
