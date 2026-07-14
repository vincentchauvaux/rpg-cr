import { getCatalogEntry } from "./catalog.js";
import { estimatePromptChars, resolveLlmTimeoutMs } from "./context-budget.js";
import { assertChatModelId, isUnsuitableMjModelId } from "./model-kind.js";
import { formatLlmModelCrashRecoveryHint } from "./model-context-tier.js";
import { isLocalLlmProvider, formatLocalLlmChecklist, formatLocalLlmModelNotFoundError, inferLocalLlmBackend, localLlmBackendLabel } from "./local-llm.js";
import { normalizeLmStudioV1BaseUrl, resolveLmStudioServerBaseUrl } from "./lmstudio-url.js";
import type { LlmRoomConfig } from "../types.js";

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionResult {
  content: string;
  providerId: string;
  modelId: string;
  usedFallback: boolean;
}

export interface LlmProviderOptions {
  apiKey?: string;
  lmStudioBaseUrl?: string;
  /** Timeout HTTP (ms) — défaut 120 s pour JIT / gros contexte MJ */
  timeoutMs?: number;
  /** Nouvelle tentative si réponse vide (chargement JIT LM Studio) */
  retryOnEmpty?: boolean;
  /** Limite tokens completion — défaut 2048 ; test connexion : 5 */
  maxTokens?: number;
  /** Annulation externe (ex. fill-all annulé par le joueur) */
  abortSignal?: AbortSignal;
}

type AssistantMessage = {
  content?: string | null | Array<string | { type?: string; text?: string }>;
  reasoning_content?: string | null;
  reasoning?: string | null;
  text?: string | null;
  tool_calls?: unknown[];
};

type ChatCompletionResponse = {
  choices?: {
    message?: AssistantMessage;
    text?: string | null;
    finish_reason?: string | null;
  }[];
  error?: { message?: string; code?: string; type?: string };
};

/** Fallback si `resolveLlmTimeoutMs` indisponible (tests unitaires minimalistes). */
export const DEFAULT_TIMEOUT_MS = 120_000;
const JIT_RETRY_DELAY_MS = 6_000;
const JIT_MAX_ATTEMPTS = 2;
const JIT_TIMEOUT_BACKOFF_MS = 8_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isDevLlmLogEnabled(): boolean {
  return (
    typeof process !== "undefined" &&
    (process.env.LLM_DEBUG === "1" || process.env.NODE_ENV !== "production")
  );
}

function devLogLlm(label: string, detail: string): void {
  if (isDevLlmLogEnabled()) {
    console.warn(`[LLM] ${label}: ${detail}`);
  }
}

/** Extrait le texte assistant depuis les variantes OpenAI / LM Studio / Qwen / Gemma. */
export function extractAssistantText(message?: AssistantMessage): string {
  if (!message) return "";

  const chunks: string[] = [];

  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) chunks.push(value.trim());
  };

  if (typeof message.content === "string") {
    push(message.content);
  } else if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (typeof block === "string") push(block);
      else if (block && typeof block === "object" && "text" in block) {
        push((block as { text?: string }).text);
      }
    }
  }

  push(message.text);

  // Ne jamais exposer reasoning_content / reasoning au chat — narrative dans content uniquement.
  return chunks.join("\n\n").trim();
}

function localLlmChecklist(modelId: string, baseUrl: string): string {
  return formatLocalLlmChecklist(inferLocalLlmBackend(baseUrl), modelId);
}

export function formatLlmHttpError(
  status: number,
  bodyText: string,
  modelId: string,
  baseUrl: string
): string {
  const backend = inferLocalLlmBackend(baseUrl);
  const backendLabel = localLlmBackendLabel(backend);

  let parsed: ChatCompletionResponse = {};
  try {
    parsed = JSON.parse(bodyText) as ChatCompletionResponse;
  } catch {
    /* corps non JSON */
  }

  const errMsg = parsed.error?.message?.trim();
  const errCode = parsed.error?.code;

  if (status === 404 || errCode === "model_not_found") {
    return formatLocalLlmModelNotFoundError(backend, modelId, baseUrl);
  }

  if (status === 408 || status === 504) {
    const waitHint =
      backend === "ollama"
        ? "Le modèle charge peut-être encore — réessayez « Tester la connexion »."
        : "Le modèle charge peut-être encore (JIT). Attendez READY puis réessayez « Tester la connexion ».";
    return `Délai dépassé (${status}) pour « ${modelId} » — ${waitHint}`;
  }

  const detail = `${errMsg ?? ""} ${bodyText}`.toLowerCase();
  if (
    status === 400 &&
    (/crashed|exit code|model has crashed|without additional information/i.test(
      detail
    ) ||
      isUnsuitableMjModelId(modelId))
  ) {
    return formatLlmModelCrashRecoveryHint(modelId);
  }

  if (errMsg) {
    return `LLM ${status} (${modelId}) : ${errMsg.slice(0, 280)}`;
  }

  return `LLM ${status} (${modelId}) : ${bodyText.slice(0, 200) || "erreur sans détail"}`;
}

export function formatEmptyLlmResponseError(
  modelId: string,
  data: ChatCompletionResponse,
  baseUrl = ""
): string {
  const choice = data.choices?.[0];
  const finish = choice?.finish_reason ?? "";
  const msg = choice?.message;
  const legacyText = choice?.text?.trim() ?? "";

  if (legacyText) return legacyText;

  if (msg?.tool_calls?.length) {
    return (
      `Le modèle « ${modelId} » a répondu uniquement via tool_calls (non supporté par RPG-CR). ` +
      "Désactivez les outils MCP/outils dans LM Studio ou choisissez un modèle instruct classique."
    );
  }

  if (finish === "length") {
    return (
      `Réponse vide ou tronquée (finish_reason=length) pour « ${modelId} ». ` +
      "Le contexte MJ est peut-être trop long — réessayez ou utilisez un modèle plus grand."
    );
  }

  return `Réponse LLM vide pour « ${modelId} ».\n${localLlmChecklist(modelId, baseUrl)}`;
}

type ChatAttemptResult =
  | { ok: true; content: string }
  | { ok: false; empty: true; data: ChatCompletionResponse }
  | { ok: false; empty: false; error: Error };

async function openAiCompatibleChatOnce(
  baseUrl: string,
  apiKey: string | undefined,
  modelId: string,
  messages: ChatCompletionMessage[],
  timeoutMs: number,
  maxTokens: number,
  abortSignal?: AbortSignal
): Promise<ChatAttemptResult> {
  assertChatModelId(modelId);

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal =
    abortSignal != null
      ? AbortSignal.any([timeoutSignal, abortSignal])
      : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.85,
        max_tokens: maxTokens,
      }),
      signal,
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      if (abortSignal?.aborted) {
        return {
          ok: false,
          empty: false,
          error: new Error("Génération annulée"),
        };
      }
    }
    if (error instanceof DOMException && error.name === "TimeoutError") {
      const backend = inferLocalLlmBackend(baseUrl);
      const waitHint =
        backend === "ollama"
          ? "Le modèle est peut-être encore en chargement — réessayez."
          : "Contexte peut-être trop long ou modèle encore en chargement (JIT) — attendez READY dans LM Studio, réduisez l'historique, puis réessayez Réclamer.";
      return {
        ok: false,
        empty: false,
        error: new Error(
          `Délai dépassé (${Math.round(timeoutMs / 1000)} s) en appelant « ${modelId} » sur ${baseUrl}. ${waitHint}`
        ),
      };
    }
    const backend = inferLocalLlmBackend(baseUrl);
    const hint =
      baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost")
        ? backend === "ollama"
          ? " Vérifiez qu'Ollama tourne sur le VPS (`systemctl status ollama`)."
          : " Vérifiez que LM Studio tourne (serveur Running, modèle READY). CORS LM Studio : inutile (seule l'API appelle LM Studio)."
        : "";
    return {
      ok: false,
      empty: false,
      error: new Error(
        `Connexion LLM refusée vers ${baseUrl}.${hint} Détail : ${error instanceof Error ? error.message : "réseau"}`
      ),
    };
  }

  const bodyText = await res.text();

  if (!res.ok) {
    return {
      ok: false,
      empty: false,
      error: new Error(formatLlmHttpError(res.status, bodyText, modelId, baseUrl)),
    };
  }

  let data: ChatCompletionResponse;
  try {
    data = JSON.parse(bodyText) as ChatCompletionResponse;
  } catch {
    devLogLlm("parse error", bodyText.slice(0, 400));
    return {
      ok: false,
      empty: false,
      error: new Error(
        `Réponse LLM illisible (JSON invalide) pour « ${modelId} ». ${localLlmChecklist(modelId, baseUrl)}`
      ),
    };
  }

  const choice = data.choices?.[0];
  const content =
    extractAssistantText(choice?.message) || choice?.text?.trim() || "";

  if (!content) {
    devLogLlm(
      "empty completion",
      JSON.stringify({
        modelId,
        finish_reason: choice?.finish_reason,
        message_keys: choice?.message ? Object.keys(choice.message) : [],
        snippet: bodyText.slice(0, 600),
      })
    );
    return { ok: false, empty: true, data };
  }

  return { ok: true, content };
}

function isTimeoutAttemptError(
  result: Extract<ChatAttemptResult, { ok: false; empty: false }>
): boolean {
  return /Délai dépassé|TimeoutError|timed out/i.test(result.error.message);
}

async function openAiCompatibleChat(
  baseUrl: string,
  apiKey: string | undefined,
  modelId: string,
  messages: ChatCompletionMessage[],
  options: {
    timeoutMs: number;
    retryOnEmpty: boolean;
    maxTokens: number;
    retryOnTimeout?: boolean;
    abortSignal?: AbortSignal;
  }
): Promise<string> {
  let lastEmptyData: ChatCompletionResponse = {};
  const emptyAttempts = options.retryOnEmpty ? JIT_MAX_ATTEMPTS : 1;
  const timeoutAttempts = options.retryOnTimeout ? 2 : 1;
  const maxAttempts = Math.max(emptyAttempts, timeoutAttempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options.abortSignal?.aborted) {
      throw new Error("Génération annulée");
    }

    const attemptTimeout =
      attempt > 1 && options.retryOnTimeout
        ? options.timeoutMs + JIT_TIMEOUT_BACKOFF_MS
        : options.timeoutMs;

    const result = await openAiCompatibleChatOnce(
      baseUrl,
      apiKey,
      modelId,
      messages,
      attemptTimeout,
      options.maxTokens,
      options.abortSignal
    );

    if (result.ok) return result.content;

    if (result.empty) {
      lastEmptyData = result.data;
      if (attempt < emptyAttempts) {
        devLogLlm("retry", `empty response — attempt ${attempt}/${emptyAttempts}, wait ${JIT_RETRY_DELAY_MS}ms`);
        await sleep(JIT_RETRY_DELAY_MS);
        continue;
      }
      throw new Error(formatEmptyLlmResponseError(modelId, lastEmptyData, baseUrl));
    }

    if (
      options.retryOnTimeout &&
      isTimeoutAttemptError(result) &&
      attempt < timeoutAttempts
    ) {
      devLogLlm(
        "retry",
        `timeout — attempt ${attempt}/${timeoutAttempts}, wait ${JIT_TIMEOUT_BACKOFF_MS}ms`
      );
      await sleep(JIT_TIMEOUT_BACKOFF_MS);
      continue;
    }

    throw result.error;
  }

  throw new Error(formatEmptyLlmResponseError(modelId, lastEmptyData, baseUrl));
}

export async function completeAsMj(
  config: LlmRoomConfig,
  messages: ChatCompletionMessage[],
  options: LlmProviderOptions = {}
): Promise<LlmCompletionResult> {
  const entry = getCatalogEntry(config.providerId);
  if (!entry) throw new Error(`Provider inconnu: ${config.providerId}`);

  const rawBase = config.baseUrl ?? entry.defaultBaseUrl ?? "https://api.openai.com/v1";
  const primaryBase = isLocalLlmProvider(config.providerId)
      ? resolveLmStudioServerBaseUrl(config, options.lmStudioBaseUrl)
      : rawBase;
  const apiKey = options.apiKey;
  const estimatedChars = estimatePromptChars(messages);
  const timeoutMs =
    options.timeoutMs ?? resolveLlmTimeoutMs(config.providerId, estimatedChars);
  const maxTokens = options.maxTokens ?? 2048;
  const retryOnEmpty =
    options.retryOnEmpty ?? isLocalLlmProvider(config.providerId);
  const retryOnTimeout = isLocalLlmProvider(config.providerId);

  assertChatModelId(config.modelId);

  try {
    const content = await openAiCompatibleChat(
      primaryBase,
      apiKey,
      config.modelId,
      messages,
      { timeoutMs, retryOnEmpty, maxTokens, retryOnTimeout, abortSignal: options.abortSignal }
    );
    return {
      content,
      providerId: config.providerId,
      modelId: config.modelId,
      usedFallback: false,
    };
  } catch (primaryError) {
    if (!config.useFallbackLmStudio || isLocalLlmProvider(config.providerId)) {
      throw primaryError;
    }

    const fallbackBase = normalizeLmStudioV1BaseUrl(
      options.lmStudioBaseUrl ?? "http://127.0.0.1:1234/v1"
    );
    const content = await openAiCompatibleChat(
      fallbackBase,
      undefined,
      config.modelId || "local-model",
      messages,
      {
        timeoutMs,
        retryOnEmpty: true,
        maxTokens,
        retryOnTimeout: true,
        abortSignal: options.abortSignal,
      }
    );
    return {
      content,
      providerId: "lmstudio",
      modelId: config.modelId || "local-model",
      usedFallback: true,
    };
  }
}
