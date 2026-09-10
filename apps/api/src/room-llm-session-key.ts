/** Clé OpenRouter / OpenAI de session : mémoire processus, jamais SQLite. */

const keys = new Map<string, string>();

export function rememberRoomLlmApiKey(
  roomId: string,
  key?: string | null
): void {
  const v = key?.trim();
  if (!roomId.trim() || !v) return;
  keys.set(roomId, v);
}

export function recallRoomLlmApiKey(roomId?: string | null): string | undefined {
  if (!roomId?.trim()) return undefined;
  return keys.get(roomId) || undefined;
}

export function forgetRoomLlmApiKey(roomId: string): void {
  keys.delete(roomId);
}
