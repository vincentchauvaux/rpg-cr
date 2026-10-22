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

const CAP_MARK = "\n[…]";

function cutEnd(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= CAP_MARK.length) return text.slice(0, Math.max(0, maxLen));
  return text.slice(0, maxLen - CAP_MARK.length) + CAP_MARK;
}

function cutStart(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= CAP_MARK.length) return text.slice(-Math.max(0, maxLen));
  return CAP_MARK + text.slice(-(maxLen - CAP_MARK.length));
}

/**
 * Plafonne le prompt MJ **total** (système + monde + user).
 * Clipper seulement le message joueur ne suffit pas : le monde est dans le système.
 * Coupe d'abord la fin du système (contexte monde), puis le début du user (historique).
 */
export function capChatMessages(
  messages: ChatCompletionMessage[],
  maxChars: number
): ChatCompletionMessage[] {
  const copy = messages.map((m) => ({
    role: m.role,
    content: m.content ?? "",
  }));
  if (maxChars <= 0 || estimatePromptChars(copy) <= maxChars) return copy;

  const minFor = (role: ChatCompletionMessage["role"]) =>
    role === "user" ? 480 : role === "system" ? 720 : 160;

  const shrink = (
    predicate: (m: ChatCompletionMessage) => boolean,
    fromEnd: boolean
  ) => {
    for (const msg of copy) {
      if (!predicate(msg)) continue;
      const total = estimatePromptChars(copy);
      if (total <= maxChars) return;
      const overflow = total - maxChars;
      const canCut = Math.max(0, msg.content.length - minFor(msg.role));
      const cut = Math.min(overflow, canCut);
      if (cut <= 0) continue;
      const keep = msg.content.length - cut;
      msg.content = fromEnd
        ? cutEnd(msg.content, keep)
        : cutStart(msg.content, keep);
    }
  };

  shrink((m) => m.role === "system", true);
  shrink((m) => m.role !== "system" && m.role !== "user", true);
  shrink((m) => m.role === "user", false);

  if (estimatePromptChars(copy) > maxChars) {
    let remaining = maxChars;
    for (let i = 0; i < copy.length; i++) {
      const othersAfter = copy.length - i - 1;
      const reserve = othersAfter * 80;
      const share = Math.max(40, remaining - reserve);
      if (copy[i].content.length > share) {
        copy[i].content =
          copy[i].role === "user"
            ? cutStart(copy[i].content, share)
            : cutEnd(copy[i].content, share);
      }
      remaining -= copy[i].content.length;
    }
  }

  return copy;
}

/** Timeout HTTP adaptatif : local LM Studio plus long ; cloud plus court. */
export function resolveLlmTimeoutMs(
  providerId: string,
  estimatedChars: number
): number {
  const isLocal = isLocalLlmProvider(providerId);
  if (!isLocal) {
    if (providerId === "gemini") return 18_000;
    if (providerId === "groq") return 45_000;
    if (estimatedChars > 16_000) return 45_000;
    return 30_000;
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
  return /LLM 429|rate limit|tokens per minute|tokens per day|\bTPM\b|\bTPD\b|Please try again in/i.test(
    error.message
  );
}

/** Crédit / plafond de clé / géo — le ping court peut encore passer. */
export function isLlmQuotaOrCreditError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /LLM 402|LLM 403|key limit|credit|quota exceeded|insufficient.?credits|payment required|User location is not supported/i.test(
    error.message
  );
}

/** 503 / saturé — Gemini OVH souvent. Ne pas attendre 90 s. */
export function isLlmUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /LLM 503|overloaded|unavailable|high demand|UNAVAILABLE|busy/i.test(error.message);
}

export function isLlmPromptTooHeavyForLocal(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /trop long pour (Ollama|Groq)/i.test(error.message);
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
