const HEALTH_TTL_MS = 30_000;

let lastHealthOkAt = 0;

export function markHealthOk(): void {
  lastHealthOkAt = Date.now();
}

export function wasHealthOkRecently(): boolean {
  return lastHealthOkAt > 0 && Date.now() - lastHealthOkAt < HEALTH_TTL_MS;
}

/** Ping léger — ne lève pas, met à jour le cache si OK */
export async function pingHealth(apiUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      markHealthOk();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
