import type { ChatMessage } from "@rpg-cr/shared";

/** Messages système réservés à l'admin (erreurs LLM, config, etc.) */
export function isTechnicalSystemMessage(content: string): boolean {
  if (content.startsWith("Le MJ n'a pas pu répondre")) return false;
  return /LLM|LM Studio|config|embeddings|modelId|Vérifiez la/i.test(content);
}

export function filterMessagesForViewer(
  messages: ChatMessage[],
  isAdminGod: boolean
): ChatMessage[] {
  return messages.filter((m) => {
    if (m.kind === "system" && isTechnicalSystemMessage(m.content) && !isAdminGod) {
      return false;
    }
    return true;
  });
}

/** Erreurs UI réservées à l'admin god */
export function isAdminOnlyError(message: string): boolean {
  if (/Réclamer|solliciter le MJ|met trop de temps/i.test(message)) return false;
  return /god mode|LLM|config MJ|Synchronisation serveur god|LM Studio|embeddings/i.test(
    message
  );
}

export function shouldShowErrorToPlayer(message: string, isAdminGod: boolean): boolean {
  if (!message.trim()) return false;
  if (isAdminGod) return true;
  if (/Réclamer|solliciter le MJ|met trop de temps|ne démarre pas|n'a pas pu répondre/i.test(message)) {
    return true;
  }
  return !isAdminOnlyError(message);
}
