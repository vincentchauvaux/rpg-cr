import {
  isLlmQuotaOrCreditError,
  isLlmRateLimitError,
  isLlmUnavailableError,
  parseLlmRetryAfterMs,
} from "./context-budget.js";

const skipUntil = new Map<string, number>();

const QUOTA_SKIP_MS = 30 * 60_000;
const UNAVAILABLE_SKIP_MS = 5 * 60_000;

export function markLlmProviderSkip(providerId: string, ms: number): void {
  if (ms <= 0) return;
  const until = Date.now() + ms;
  const prev = skipUntil.get(providerId) ?? 0;
  skipUntil.set(providerId, Math.max(prev, until));
}

export function isLlmProviderSkipped(providerId: string): boolean {
  const until = skipUntil.get(providerId);
  if (until == null) return false;
  if (Date.now() >= until) {
    skipUntil.delete(providerId);
    return false;
  }
  return true;
}

export function clearLlmProviderSkips(): void {
  skipUntil.clear();
}

export function skipMsForLlmError(error: unknown): number {
  if (isLlmQuotaOrCreditError(error)) return QUOTA_SKIP_MS;
  if (isLlmUnavailableError(error)) return UNAVAILABLE_SKIP_MS;
  if (isLlmRateLimitError(error) && error instanceof Error) {
    return Math.min(parseLlmRetryAfterMs(error.message, 8_000), 60_000);
  }
  return 0;
}

export function rememberLlmProviderFailure(providerId: string, error: unknown): void {
  markLlmProviderSkip(providerId, skipMsForLlmError(error));
}

/** 7B CPU : un roman de 37k caractères = 5 min. On refuse, le tour MJ réduit le prompt. */
export const LOCAL_NARRATION_MAX_CHARS = 12_000;

/** Groq free 8k TPM : un 37k car. claque avant le slim. */
export const GROQ_NARRATION_MAX_CHARS = 10_000;

export function shouldSkipLocalNarration(
  estimatedChars: number,
  taskKind: string
): boolean {
  return taskKind === "narration" && estimatedChars > LOCAL_NARRATION_MAX_CHARS;
}

export function shouldSkipGroqNarration(
  estimatedChars: number,
  taskKind: string
): boolean {
  return taskKind === "narration" && estimatedChars > GROQ_NARRATION_MAX_CHARS;
}
