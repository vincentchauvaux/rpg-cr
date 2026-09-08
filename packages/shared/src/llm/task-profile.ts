import type { LlmRoomConfig } from "../types.js";
import { defaultToolModelId, getCatalogEntry } from "./catalog.js";
import { isLocalLlmProvider } from "./local-llm.js";

/** Kind d'appel LLM : récit créatif vs extraction / utilitaire. */
export type LlmTaskKind = "narration" | "tool";

export type LlmTaskProfile = {
  temperature: number;
  jsonMode: boolean;
  maxTokens: number;
};

export const LLM_TASK_PROFILES: Record<LlmTaskKind, LlmTaskProfile> = {
  narration: { temperature: 0.85, jsonMode: false, maxTokens: 2048 },
  tool: { temperature: 0.15, jsonMode: false, maxTokens: 1024 },
};

/**
 * Modèle à appeler pour un kind.
 * narration → `modelId` ;
 * tool → `toolModelId` → sibling catalogue (cloud) → même `modelId` (local).
 */
export function resolveTaskModelId(config: LlmRoomConfig, kind: LlmTaskKind): string {
  const primary = config.modelId.trim();
  if (kind === "narration") return primary;

  const explicit = config.toolModelId?.trim();
  if (explicit) return explicit;

  if (isLocalLlmProvider(config.providerId)) return primary;

  const sibling = defaultToolModelId(getCatalogEntry(config.providerId)).trim();
  return sibling || primary;
}
