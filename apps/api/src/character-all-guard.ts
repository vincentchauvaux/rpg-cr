/** TTL au-delà du timeout LLM (180 s) + marge client — libère les verrous orphelins. */
export const CHARACTER_ALL_LOCK_TTL_MS = 4 * 60 * 1000;

type LockEntry = {
  startedAt: number;
  token: string;
  abortController: AbortController;
};

const inFlightPlayers = new Map<string, LockEntry>();

function newLockToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function evictStaleLock(playerId: string): void {
  const entry = inFlightPlayers.get(playerId);
  if (!entry) return;
  if (Date.now() - entry.startedAt >= CHARACTER_ALL_LOCK_TTL_MS) {
    entry.abortController.abort();
    inFlightPlayers.delete(playerId);
  }
}

/** Une seule génération fill-all par joueur à la fois (parallèle OK entre PJ du même salon). */
export function tryAcquireCharacterAllGeneration(playerId: string): string | null {
  evictStaleLock(playerId);
  if (inFlightPlayers.has(playerId)) return null;
  const token = newLockToken();
  inFlightPlayers.set(playerId, {
    startedAt: Date.now(),
    token,
    abortController: new AbortController(),
  });
  return token;
}

export function getCharacterAllAbortSignal(
  playerId: string,
  token: string
): AbortSignal | undefined {
  const entry = inFlightPlayers.get(playerId);
  if (entry?.token === token) return entry.abortController.signal;
  return undefined;
}

/** true si le jeton ne correspond plus au verrou actif (annulation ou remplacement). */
export function isCharacterAllGenerationAborted(playerId: string, token: string): boolean {
  const entry = inFlightPlayers.get(playerId);
  return !entry || entry.token !== token;
}

/** Libère le verrou seulement si le jeton correspond. */
export function releaseCharacterAllGeneration(playerId: string, token?: string): void {
  if (!token) {
    const entry = inFlightPlayers.get(playerId);
    entry?.abortController.abort();
    inFlightPlayers.delete(playerId);
    return;
  }
  const entry = inFlightPlayers.get(playerId);
  if (entry?.token === token) {
    inFlightPlayers.delete(playerId);
  }
}

/** Annulation manuelle — interrompt aussi l'appel LLM en cours si possible. */
export function forceReleaseCharacterAllGeneration(playerId: string): boolean {
  evictStaleLock(playerId);
  const entry = inFlightPlayers.get(playerId);
  if (!entry) return false;
  entry.abortController.abort();
  inFlightPlayers.delete(playerId);
  return true;
}

export function getCharacterAllGenerationLock(playerId: string): {
  inFlight: boolean;
  startedAt: number | null;
} {
  evictStaleLock(playerId);
  const entry = inFlightPlayers.get(playerId);
  return { inFlight: entry !== undefined, startedAt: entry?.startedAt ?? null };
}

export function isLlmTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Délai dépassé|TimeoutError|timed out|timeout/i.test(error.message);
}

export function isGenerationCancelledError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === "Génération annulée") return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return /aborted|annulée/i.test(error.message);
}

export function assertCharacterAllNotAborted(playerId: string, token: string): void {
  if (isCharacterAllGenerationAborted(playerId, token)) {
    throw new Error("Génération annulée");
  }
}
