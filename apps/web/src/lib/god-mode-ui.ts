/**
 * Panneau admin (god mode UI) — règle « never auto-sync » :
 * - La visibilité du panneau = localStorage uniquement (+ clic utilisateur).
 * - Jamais de setState/setAdminOpen depuis refresh, WS, player.isGodMode ou réponse PATCH.
 * - Le serveur (is_god_mode DB) est secondaire : PATCH fire-and-forget pour les endpoints API.
 */

const PREFIX = "rpg-cr-admin-panel";
const LEGACY_PREFIX = "rpg-cr-god-ui";

const listeners = new Set<() => void>();

function storageKey(playerId: string): string {
  return `${PREFIX}:${playerId}`;
}

function migrateLegacyKey(playerId: string): void {
  const key = storageKey(playerId);
  if (localStorage.getItem(key) !== null) return;
  const legacy = localStorage.getItem(`${LEGACY_PREFIX}:${playerId}`);
  if (legacy === "1") localStorage.setItem(key, "true");
  else if (legacy === "0") localStorage.setItem(key, "false");
}

/** Abonnement React (useSyncExternalStore) — pas d'effet setState dans les composants */
export function subscribeAdminPanel(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function notifyAdminPanelChange(): void {
  listeners.forEach((l) => l());
}

/** Lit la préférence UI — défaut false si jamais enregistrée */
export function loadAdminPanel(playerId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    migrateLegacyKey(playerId);
    const raw = localStorage.getItem(storageKey(playerId));
    if (raw === "true") return true;
    if (raw === "false") return false;
    return false;
  } catch {
    return false;
  }
}

/** Écrit la préférence UI et notifie les abonnés (switch contrôlé) */
export function saveAdminPanel(playerId: string, open: boolean): void {
  localStorage.setItem(storageKey(playerId), open ? "true" : "false");
  notifyAdminPanelChange();
}

/** @deprecated Préférer loadAdminPanel / saveAdminPanel */
export function loadGodModeUi(playerId: string): boolean | null {
  if (typeof window === "undefined") return null;
  migrateLegacyKey(playerId);
  const raw = localStorage.getItem(storageKey(playerId));
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

/** @deprecated Préférer saveAdminPanel */
export function saveGodModeUi(playerId: string, enabled: boolean): void {
  saveAdminPanel(playerId, enabled);
}
