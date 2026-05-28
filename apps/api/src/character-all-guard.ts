/** TTL au-delà du timeout LLM (180 s) + marge client — libère les verrous orphelins. */
export const CHARACTER_ALL_LOCK_TTL_MS = 4 * 60 * 1000;

const inFlightPlayers = new Map<string, number>();

function evictStaleLock(playerId: string): void {
  const startedAt = inFlightPlayers.get(playerId);
  if (startedAt === undefined) return;
  if (Date.now() - startedAt >= CHARACTER_ALL_LOCK_TTL_MS) {
    inFlightPlayers.delete(playerId);
  }
}

/** Une seule génération fill-all par joueur à la fois (parallèle OK entre PJ du même salon). */
export function tryAcquireCharacterAllGeneration(playerId: string): boolean {
  evictStaleLock(playerId);
  if (inFlightPlayers.has(playerId)) return false;
  inFlightPlayers.set(playerId, Date.now());
  return true;
}

export function releaseCharacterAllGeneration(playerId: string): void {
  inFlightPlayers.delete(playerId);
}

/** Annulation manuelle (autre appareil, verrou bloqué). Retourne true si un verrou existait. */
export function forceReleaseCharacterAllGeneration(playerId: string): boolean {
  evictStaleLock(playerId);
  const had = inFlightPlayers.has(playerId);
  inFlightPlayers.delete(playerId);
  return had;
}

export function getCharacterAllGenerationLock(playerId: string): {
  inFlight: boolean;
  startedAt: number | null;
} {
  evictStaleLock(playerId);
  const startedAt = inFlightPlayers.get(playerId) ?? null;
  return { inFlight: startedAt !== null, startedAt };
}

export function isLlmTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Délai dépassé|TimeoutError|timed out|timeout/i.test(error.message);
}
