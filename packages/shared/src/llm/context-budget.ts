import type { ChatCompletionMessage } from "./providers.js";

/** Cible caractères « monde » pour un tour MJ complet (hors prompt système de base). */
export const MJ_WORLD_CONTEXT_MAX_FULL = 24_000;
export const MJ_WORLD_CONTEXT_MAX_SLIM = 12_000;

export const MJ_RECENT_MSG_LIMIT_FULL = 16;
export const MJ_RECENT_MSG_LIMIT_SLIM = 8;

export const MJ_RECENT_MSG_SLICE_FULL = 420;
export const MJ_RECENT_MSG_SLICE_SLIM = 280;

export const MJ_PLAYER_SHEET_MAX_FULL = 3500;
export const MJ_PLAYER_SHEET_MAX_SLIM = 1800;

export type MjContextMode = "full" | "slim";

export function mjContextLimits(mode: MjContextMode): {
  worldMax: number;
  recentLimit: number;
  recentSlice: number;
  playerSheetMax: number;
} {
  if (mode === "slim") {
    return {
      worldMax: MJ_WORLD_CONTEXT_MAX_SLIM,
      recentLimit: MJ_RECENT_MSG_LIMIT_SLIM,
      recentSlice: MJ_RECENT_MSG_SLICE_SLIM,
      playerSheetMax: MJ_PLAYER_SHEET_MAX_SLIM,
    };
  }
  return {
    worldMax: MJ_WORLD_CONTEXT_MAX_FULL,
    recentLimit: MJ_RECENT_MSG_LIMIT_FULL,
    recentSlice: MJ_RECENT_MSG_SLICE_FULL,
    playerSheetMax: MJ_PLAYER_SHEET_MAX_FULL,
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
  const isLocal = providerId === "lmstudio";
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
