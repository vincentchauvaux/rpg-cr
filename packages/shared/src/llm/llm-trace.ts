import { classifyLlmFailure } from "./llm-health.js";

/** Contexte salon / file — jamais de prompt ni de clé. */
export type LlmTraceContext = {
  roomId?: string;
  roomCode?: string;
  purpose?: string;
  queueWaitMs?: number;
};

export type LlmTraceEvent = {
  at: string;
  ok: boolean;
  usedFallback: boolean;
  requestedProvider: string;
  requestedModel: string;
  effectiveProvider?: string;
  effectiveModel?: string;
  envProvider?: string | null;
  taskKind: string;
  promptChars: number;
  durationMs: number;
  usageTotal?: number;
  outcome?: string;
  error?: string;
  purpose?: string;
  roomId?: string;
  roomCode?: string;
  queueWaitMs?: number;
};

type TraceSink = (event: LlmTraceEvent) => void;
type TraceContextProvider = () => LlmTraceContext | undefined;

let sink: TraceSink | undefined;
let contextProvider: TraceContextProvider | undefined;

export function setLlmTraceSink(next: TraceSink | undefined): void {
  sink = next;
}

export function setLlmTraceContextProvider(
  next: TraceContextProvider | undefined
): void {
  contextProvider = next;
}

export function peekLlmTraceContext(): LlmTraceContext | undefined {
  return contextProvider?.();
}

/** Retire clés API / tokens des messages d'erreur. */
export function redactLlmLogText(raw: unknown, max = 280): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? "");
  const cleaned = text
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/\bsk-[a-zA-Z0-9_-]+/g, "sk-***")
    .replace(/\bgsk_[a-zA-Z0-9]+/g, "gsk-***")
    .replace(/\bAIza[0-9A-Za-z_-]+/g, "AIza***")
    .replace(/keys\/[a-f0-9]{20,}/gi, "keys/***");
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

export function formatLlmTraceConsole(event: LlmTraceEvent): string {
  const got =
    event.effectiveProvider && event.effectiveModel
      ? `${event.effectiveProvider}/${event.effectiveModel}`
      : "?";
  const req = `${event.requestedProvider}/${event.requestedModel}`;
  const where = event.roomCode ? ` room=${event.roomCode}` : "";
  const why = event.purpose ? ` ${event.purpose}` : "";
  const fb = event.usedFallback ? " fallback" : "";
  const err = event.ok ? "" : ` err=${event.error ?? event.outcome ?? "error"}`;
  return `ok=${event.ok}${fb} ${req}→${got} ${event.durationMs}ms chars=${event.promptChars}${why}${where}${err}`;
}

export function emitLlmTrace(event: LlmTraceEvent): void {
  const safe: LlmTraceEvent = {
    ...event,
    error: event.error ? redactLlmLogText(event.error) : undefined,
  };
  const silentTests =
    process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
  if (!silentTests) {
    console.info(`[LLM] ${formatLlmTraceConsole(safe)}`);
  }
  try {
    sink?.(safe);
  } catch {
    /* le journal ne doit jamais faire échouer l'appel */
  }
}

export function llmTraceOutcomeFromError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return classifyLlmFailure(message);
}
