import { resolveServerAiApiKey } from "@rpg-cr/shared";

/** Résout la clé cloud : env serveur (Groq/Gemini toujours) puis champ god mode. */

export function resolveCloudApiKey(
  providerId?: string | null,
  requestKey?: string | null
): string | undefined {
  return resolveServerAiApiKey(providerId, requestKey);
}

export function resolveRoomApiKey(
  config?: { providerId: string } | null,
  requestKey?: string | null
): string | undefined {
  return resolveCloudApiKey(config?.providerId, requestKey);
}
