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

export function isLlmRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /LLM 429|rate limit|tokens per minute|\bTPM\b|Please try again in/i.test(
    error.message
  );
}

/** Groq inclut `max_tokens` dans le TPM : attendre le délai annoncé (ex. 8.52s). */
export function parseLlmRetryAfterMs(message: string, fallbackMs = 8_000): number {
  const m =
    message.match(/try again in\s+([\d.]+)\s*s/i) ??
    message.match(/réessayez dans\s+([\d.]+)\s*s/i);
  if (m?.[1]) {
    const sec = Number(m[1]);
    if (Number.isFinite(sec) && sec > 0) {
      return Math.ceil(sec * 1000);
    }
  }
  return fallbackMs;
}

export function isContextLengthLlmError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /context length|tokens to keep|greater than the context|context window|too many tokens/i.test(
    error.message
  );
}

export function resolveMjMaxTokens(providerId: string, modelId: string): number {
  /** Groq TPM compte aussi la réservation `max_tokens` (4096 tuait le 20B en 2 tours). */
  if (providerId === "groq") {
    return isReasoningChatModelId(modelId) ? 1536 : 1400;
  }
  if (isReasoningChatModelId(modelId)) return 4096;
  const tier = inferModelContextTier(modelId);
  if (tier === "small") return 640;
  if (tier === "medium") return 1200;
  return isLocalLlmProvider(providerId) ? 1536 : 2048;
}
