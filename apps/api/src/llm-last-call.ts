import type { LlmLastCall } from "@rpg-cr/shared";

const byRoom = new Map<string, LlmLastCall>();

export function recordLlmLastCall(roomId: string, call: LlmLastCall): void {
  byRoom.set(roomId, call);
}

export function getLlmLastCall(roomId: string): LlmLastCall | undefined {
  return byRoom.get(roomId);
}
