/**
 * Onboarding hôte : configuration MJ avant création de fiche.
 * `pending` posé à la création de salon ; `done` après validation LLM + « Continuer ».
 */

const PREFIX = "rpg-cr-host-llm-setup";

function key(roomId: string): string {
  return `${PREFIX}:${roomId}`;
}

export function markHostLlmSetupPending(roomId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(roomId), "pending");
  } catch {
    /* quota / mode privé */
  }
}

export function markHostLlmSetupComplete(roomId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(roomId), "done");
  } catch {
    /* quota / mode privé */
  }
}

export function isHostLlmSetupComplete(roomId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key(roomId)) === "done";
  } catch {
    return false;
  }
}
