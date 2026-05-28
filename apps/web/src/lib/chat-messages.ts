import type { ChatMessage } from "@rpg-cr/shared";

/** Fusionne des messages entrants sans doublon d'id (WS + refresh API). */
export function mergeChatMessages(
  prev: ChatMessage[],
  incoming: ChatMessage[]
): ChatMessage[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((m) => m.id));
  const added = incoming.filter((m) => !seen.has(m.id));
  if (added.length === 0) return prev;
  return [...prev, ...added];
}

export function appendChatMessage(
  prev: ChatMessage[],
  message: ChatMessage
): ChatMessage[] {
  if (prev.some((m) => m.id === message.id)) return prev;
  return [...prev, message];
}
