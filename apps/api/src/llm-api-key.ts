import { resolveServerAiApiKey } from "@rpg-cr/shared";
import { recallRoomLlmApiKey, rememberRoomLlmApiKey } from "./room-llm-session-key.js";

/** Résout la clé cloud : env serveur (Groq/Gemini toujours) puis champ god mode. */

export function resolveCloudApiKey(
  providerId?: string | null,
  requestKey?: string | null
): string | undefined {
  return resolveServerAiApiKey(providerId, requestKey);
}

/**
 * Clé du tour MJ : requête (test / god mode) → mémoire salon (après un test OK)
 * → `OPENROUTER_API_KEY` / `OPENAI_API_KEY` dans `.env`.
 */
export function resolveRoomApiKey(
  config?: { providerId: string } | null,
  requestKey?: string | null,
  roomId?: string | null
): string | undefined {
  const fromRequest = requestKey?.trim() || undefined;
  if (roomId && fromRequest) rememberRoomLlmApiKey(roomId, fromRequest);
  const fromSession = recallRoomLlmApiKey(roomId);
  return resolveCloudApiKey(config?.providerId, fromRequest || fromSession);
}
