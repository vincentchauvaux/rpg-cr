import type { ChatCompletionMessage } from "./providers.js";
import { isLocalLlmProvider } from "./local-llm.js";
import { inferModelContextTier } from "./model-context-tier.js";
import { isReasoningChatModelId } from "./model-kind.js";

/** Cible caractères « monde » pour un tour MJ complet (hors prompt système de base). */
export const MJ_WORLD_CONTEXT_MAX_FULL = 24_000;
export const MJ_WORLD_CONTEXT_MAX_SLIM = 12_000;

export const MJ_RECENT_MSG_LIMIT_FULL = 16;
export const MJ_RECENT_MSG_LIMIT_SLIM = 8;

export const MJ_RECENT_MSG_SLICE_FULL = 420;
export const MJ_RECENT_MSG_SLICE_SLIM = 280;

export const MJ_PLAYER_SHEET_MAX_FULL = 3500;
export const MJ_PLAYER_SHEET_MAX_SLIM = 1800;

export const MJ_WORLD_CONTEXT_MAX_MICRO = 2_800;
export const MJ_RECENT_MSG_LIMIT_MICRO = 4;
export const MJ_RECENT_MSG_SLICE_MICRO = 160;
export const MJ_PLAYER_SHEET_MAX_MICRO = 700;

export type MjContextMode = "full" | "slim" | "micro";

export function mjContextLimits(mode: MjContextMode): {
  worldMax: number;
  recentLimit: number;
  recentSlice: number;
  playerSheetMax: number;
  compactSystem: boolean;
} {
  if (mode === "micro") {
    return {
      worldMax: MJ_WORLD_CONTEXT_MAX_MICRO,
      recentLimit: MJ_RECENT_MSG_LIMIT_MICRO,
      recentSlice: MJ_RECENT_MSG_SLICE_MICRO,
      playerSheetMax: MJ_PLAYER_SHEET_MAX_MICRO,
      compactSystem: true,
    };
  }
  if (mode === "slim") {
    return {
      worldMax: MJ_WORLD_CONTEXT_MAX_SLIM,
      recentLimit: MJ_RECENT_MSG_LIMIT_SLIM,
      recentSlice: MJ_RECENT_MSG_SLICE_SLIM,
      playerSheetMax: MJ_PLAYER_SHEET_MAX_SLIM,
      compactSystem: false,
    };
  }
  return {
    worldMax: MJ_WORLD_CONTEXT_MAX_FULL,
    recentLimit: MJ_RECENT_MSG_LIMIT_FULL,
    recentSlice: MJ_RECENT_MSG_SLICE_FULL,
    playerSheetMax: MJ_PLAYER_SHEET_MAX_FULL,
    compactSystem: false,
  };
}

export function estimatePromptChars(messages: ChatCompletionMessage[]): number {
  return messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
}

/** Timeout HTTP adaptatif : local LM Studio plus long ; cloud plus court. */
export function resolveLlmTimeoutMs(
  providerId: string,
  estimatedChars: number
): number {
  const isLocal = isLocalLlmProvider(providerId);
  if (!isLocal) {
    if (estimatedChars > 28_000) return 120_000;
    if (estimatedChars > 16_000) return 100_000;
    return 90_000;
  }

  const base = 180_000;
  const scaled = Math.floor(estimatedChars / 400) * 1_000;
  return Math.min(240_000, base + Math.min(60_000, scaled));
}

export function isLlmTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Délai dépassé|TimeoutError|timed out|timeout/i.test(error.message);
}

export function isContextLengthLlmError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /context length|tokens to keep|greater than the context|context window|too many tokens/i.test(
    error.message
  );
}

export function resolveMjMaxTokens(providerId: string, modelId: string): number {
  if (isReasoningChatModelId(modelId)) return 4096;
  const tier = inferModelContextTier(modelId);
  if (tier === "small") return 640;
  if (tier === "medium") return 1200;
  return isLocalLlmProvider(providerId) ? 1536 : 2048;
}
