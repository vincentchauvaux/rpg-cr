import { getCatalogEntry, isOpenRouterProvider } from "./catalog.js";
import { estimatePromptChars, resolveLlmTimeoutMs, isLlmRateLimitError, parseLlmRetryAfterMs, resolveMjMaxTokens } from "./context-budget.js";
import {
  appendQuotaToLlmError,
  parseLlmQuotaFromHeaders,
  parseLlmQuotaFromText,
  parseLlmUsage,
  mergeLlmQuota,
  type LlmQuotaHint,
  type LlmUsage,
} from "./llm-health.js";
import { assertChatModelId, isReasoningChatModelId, isUnsuitableMjModelId } from "./model-kind.js";
import { formatLlmModelCrashRecoveryHint } from "./model-context-tier.js";
import {
  isLocalLlmProvider,
  formatLocalLlmChecklist,
  formatLocalLlmModelNotFoundError,
  inferLocalLlmBackend,
  localLlmBackendLabel,
  isLikelyCloudMarketModelId,
} from "./local-llm.js";
import { normalizeLmStudioV1BaseUrl, resolveLmStudioServerBaseUrl } from "./lmstudio-url.js";
import { LLM_TASK_PROFILES, resolveTaskModelId, type LlmTaskKind } from "./task-profile.js";
import {
  fallbackProviderConfig,
  missingServerApiKeyError,
  readEnvAiSettings,
  resolveEffectiveLlmConfig,
  resolveServerAiApiKey,
  usesServerOnlyApiKey,
} from "./env-ai.js";
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
  usage?: LlmUsage;
  quota?: LlmQuotaHint;
}

export interface LlmProviderOptions {
  apiKey?: string;
  lmStudioBaseUrl?: string;
  /** Timeout HTTP (ms) — défaut 120 s pour JIT / gros contexte MJ */
  timeoutMs?: number;
  /** Nouvelle tentative si réponse vide (chargement JIT LM Studio) */
  retryOnEmpty?: boolean;
  /** Limite tokens completion — défaut selon le profil de tâche */
  maxTokens?: number;
  /** Annulation externe (ex. fill-all annulé par le joueur) */
  abortSignal?: AbortSignal;
  /** Kind d'appel — défaut narration */
  taskKind?: LlmTaskKind;
  /** Surcharge température (sinon profil du kind) */
  temperature?: number;
  /** `response_format: json_object` — retry sans le champ si 400 */
  jsonMode?: boolean;
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
  usage?: Record<string, unknown>;
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

function openRouterAttributionHeaders(): Record<string, string> {
  const referer =
    (typeof process !== "undefined" &&
      (process.env.OPENROUTER_HTTP_REFERER?.trim() ||
        process.env.AUTH_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim())) ||
    "https://vps-e09ed6db.vps.ovh.net/rpg-cr";
  return {
    "HTTP-Referer": referer.replace(/\/$/, ""),
    "X-Title": "RPG-CR",
    "X-OpenRouter-Title": "RPG-CR",
  };
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

  const isLocalUrl =
    baseUrl.includes("127.0.0.1") ||
    baseUrl.includes("localhost") ||
    baseUrl.includes("host.docker.internal");

  if (status === 404 || errCode === "model_not_found") {
    if (!isLocalUrl) {
      return (
        `Modèle introuvable « ${modelId} » sur ${baseUrl}. ` +
        "Vérifiez `AI_MODEL` (Groq : GET https://api.groq.com/openai/v1/models)."
      );
    }
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
    if (isReasoningChatModelId(modelId)) {
      return (
        `Réponse vide (finish_reason=length) pour « ${modelId} » : le modèle a utilisé ` +
        `tout son budget de tokens en raisonnement interne. Réessayez ; le 20B Groq suffit ` +
        `souvent, ce n'est pas lié au nombre de salons.`
      );
    }
    return (
      `Réponse vide ou tronquée (finish_reason=length) pour « ${modelId} ». ` +
      "Le contexte MJ est peut-être trop long — réessayez ou utilisez un modèle plus grand."
    );
  }

  return `Réponse LLM vide pour « ${modelId} ».\n${localLlmChecklist(modelId, baseUrl)}`;
}

type ChatOk = { ok: true; content: string; usage?: LlmUsage; quota?: LlmQuotaHint };
type ChatAttemptResult =
  | ChatOk
  | { ok: false; empty: true; data: ChatCompletionResponse }
  | { ok: false; empty: false; error: Error };

async function openAiCompatibleChatOnce(
  baseUrl: string,
  apiKey: string | undefined,
  modelId: string,
  messages: ChatCompletionMessage[],
  timeoutMs: number,
  maxTokens: number,
  abortSignal: AbortSignal | undefined,
  sampling: { temperature: number; jsonMode: boolean },
  extraHeaders: Record<string, string> = {},
  allowJsonModeRetry = true,
  allowReasoningRetry = true
): Promise<ChatAttemptResult> {
  assertChatModelId(modelId);

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  Object.assign(headers, extraHeaders);

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal =
    abortSignal != null
      ? AbortSignal.any([timeoutSignal, abortSignal])
      : timeoutSignal;

  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    temperature: sampling.temperature,
    max_tokens: maxTokens,
  };
  if (sampling.jsonMode) {
    body.response_format = { type: "json_object" };
  }
  if (isReasoningChatModelId(modelId) && allowReasoningRetry) {
    body.reasoning_effort = "low";
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
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
      const isLocalUrl =
        baseUrl.includes("127.0.0.1") ||
        baseUrl.includes("localhost") ||
        baseUrl.includes("host.docker.internal");
      const backend = inferLocalLlmBackend(baseUrl);
      const waitHint = !isLocalUrl
        ? "Le fournisseur cloud n'a pas répondu à temps — réessayez."
        : backend === "ollama"
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
    if (sampling.jsonMode && allowJsonModeRetry && res.status === 400) {
      devLogLlm(
        "retry",
        `json_object rejected (${res.status}) — retry without response_format`
      );
      return openAiCompatibleChatOnce(
        baseUrl,
        apiKey,
        modelId,
        messages,
        timeoutMs,
        maxTokens,
        abortSignal,
        { temperature: sampling.temperature, jsonMode: false },
        extraHeaders,
        false,
        allowReasoningRetry
      );
    }
    if (isReasoningChatModelId(modelId) && allowReasoningRetry && res.status === 400) {
      devLogLlm(
        "retry",
        `reasoning_effort rejected (${res.status}) — retry without it`
      );
      return openAiCompatibleChatOnce(
        baseUrl,
        apiKey,
        modelId,
        messages,
        timeoutMs,
        maxTokens,
        abortSignal,
        sampling,
        extraHeaders,
        false,
        false
      );
    }
    const quota = mergeLlmQuota(
      parseLlmQuotaFromHeaders(res.headers),
      parseLlmQuotaFromText(bodyText)
    );
    return {
      ok: false,
      empty: false,
      error: new Error(
        appendQuotaToLlmError(
          formatLlmHttpError(res.status, bodyText, modelId, baseUrl),
          quota
        )
      ),
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

  return { ok: true, content, usage: parseLlmUsage(data), quota: parseLlmQuotaFromHeaders(res.headers) };
}

function isTimeoutAttemptError(
  result: Extract<ChatAttemptResult, { ok: false; empty: false }>
): boolean {
  return /Délai dépassé|TimeoutError|timed out/i.test(result.error.message);
}

type LlmChatPayload = {
  content: string;
  usage?: LlmUsage;
  quota?: LlmQuotaHint;
};

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
    temperature: number;
    jsonMode: boolean;
    extraHeaders?: Record<string, string>;
  }
): Promise<LlmChatPayload> {
  let lastEmptyData: ChatCompletionResponse = {};
  const emptyAttempts = options.retryOnEmpty ? JIT_MAX_ATTEMPTS : 1;
  const timeoutAttempts = options.retryOnTimeout ? 2 : 1;
  const sampling = { temperature: options.temperature, jsonMode: options.jsonMode };
  const extraHeaders = options.extraHeaders ?? {};
  let maxTokens = options.maxTokens;
  const groqTpmCap = /api\.groq\.com/i.test(baseUrl) ? 2048 : 8192;
  const maxAttempts = Math.max(emptyAttempts, timeoutAttempts, 2);
  let rateLimitRetries = 0;

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
      maxTokens,
      options.abortSignal,
      sampling,
      extraHeaders
    );

    if (result.ok) {
      return { content: result.content, usage: result.usage, quota: result.quota };
    }

    if (result.empty) {
      lastEmptyData = result.data;
      const finish = result.data.choices?.[0]?.finish_reason;
      if (finish === "length" && attempt < maxAttempts) {
        maxTokens = Math.min(Math.max(maxTokens * 2, 512), groqTpmCap);
        devLogLlm(
          "retry",
          `finish_reason=length — attempt ${attempt}/${maxAttempts}, max_tokens=${maxTokens}`
        );
        continue;
      }
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

    if (isLlmRateLimitError(result.error) && rateLimitRetries < 1) {
      rateLimitRetries += 1;
      const waitMs = Math.min(parseLlmRetryAfterMs(result.error.message), 15_000);
      devLogLlm(
        "retry",
        `HTTP 429 rate limit — wait ${waitMs}ms then retry`
      );
      await sleep(Math.max(waitMs, 0));
      continue;
    }

    throw result.error;
  }

  throw new Error(formatEmptyLlmResponseError(modelId, lastEmptyData, baseUrl));
}

function resolveLmStudioFallbackModelId(
  effectiveModelId: string,
  originalConfig: LlmRoomConfig
): string | null {
  const original = originalConfig.modelId?.trim() ?? "";
  if (
    isLocalLlmProvider(originalConfig.providerId) &&
    original &&
    !isLikelyCloudMarketModelId(original)
  ) {
    return original;
  }
  const id = effectiveModelId.trim();
  if (!id || isLikelyCloudMarketModelId(id)) return null;
  return id;
}

type ChatRunOptions = {
  timeoutMs: number;
  retryOnEmpty: boolean;
  maxTokens: number;
  retryOnTimeout: boolean;
  abortSignal?: AbortSignal;
  temperature: number;
  jsonMode: boolean;
};

async function completeAgainstConfig(
  config: LlmRoomConfig,
  messages: ChatCompletionMessage[],
  options: LlmProviderOptions,
  chatOptions: ChatRunOptions,
  requestApiKey?: string
): Promise<{
  content: string;
  providerId: string;
  modelId: string;
  usage?: LlmUsage;
  quota?: LlmQuotaHint;
}> {
  const entry = getCatalogEntry(config.providerId);
  if (!entry) throw new Error(`Provider inconnu: ${config.providerId}`);

  const taskKind = options.taskKind ?? "narration";
  const modelId = resolveTaskModelId(config, taskKind);
  assertChatModelId(modelId);

  const rawBase = config.baseUrl ?? entry.defaultBaseUrl ?? "https://api.openai.com/v1";
  const baseUrl = isLocalLlmProvider(config.providerId)
    ? resolveLmStudioServerBaseUrl(config, options.lmStudioBaseUrl)
    : rawBase;
  const apiKey = usesServerOnlyApiKey(config.providerId)
    ? resolveServerAiApiKey(config.providerId)
    : resolveServerAiApiKey(config.providerId, requestApiKey);

  if (usesServerOnlyApiKey(config.providerId) && !apiKey) {
    throw new Error(missingServerApiKeyError(config.providerId));
  }

  const extraHeaders =
    isOpenRouterProvider(config.providerId) || baseUrl.includes("openrouter.ai")
      ? openRouterAttributionHeaders()
      : {};

  const payload = await openAiCompatibleChat(baseUrl, apiKey, modelId, messages, {
    ...chatOptions,
    extraHeaders,
  });
  return { ...payload, providerId: config.providerId, modelId };
}

function formatChainedLlmFailure(
  primary: unknown,
  fallbackProvider: string,
  fallbackError: unknown
): Error {
  const first = primary instanceof Error ? primary.message : String(primary);
  const second =
    fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
  return new Error(`${first} — puis secours ${fallbackProvider} : ${second}`);
}

export async function completeChat(
  config: LlmRoomConfig,
  messages: ChatCompletionMessage[],
  options: LlmProviderOptions = {}
): Promise<LlmCompletionResult> {
  const envAi = readEnvAiSettings();
  const effective = resolveEffectiveLlmConfig(config, envAi);
  const entry = getCatalogEntry(effective.providerId);
  if (!entry) throw new Error(`Provider inconnu: ${effective.providerId}`);

  const taskKind = options.taskKind ?? "narration";
  const profile = LLM_TASK_PROFILES[taskKind];
  const temperature = options.temperature ?? profile.temperature;
  const jsonMode = options.jsonMode ?? profile.jsonMode;
  const estimatedChars = estimatePromptChars(messages);
  const timeoutMs =
    options.timeoutMs ?? resolveLlmTimeoutMs(effective.providerId, estimatedChars);
  const requestedMax = options.maxTokens ?? profile.maxTokens;
  const modelIdForTask = resolveTaskModelId(effective, taskKind);
  const maxTokens =
    effective.providerId === "groq" && taskKind === "narration"
      ? Math.min(requestedMax, resolveMjMaxTokens("groq", modelIdForTask))
      : requestedMax;
  const retryOnEmpty =
    options.retryOnEmpty ??
    (isLocalLlmProvider(effective.providerId) ||
      isReasoningChatModelId(modelIdForTask));
  const retryOnTimeout = isLocalLlmProvider(effective.providerId);

  const chatOptions: ChatRunOptions = {
    timeoutMs,
    retryOnEmpty,
    maxTokens,
    retryOnTimeout,
    abortSignal: options.abortSignal,
    temperature,
    jsonMode,
  };

  let primaryError: unknown;
  try {
    const result = await completeAgainstConfig(
      effective,
      messages,
      options,
      chatOptions,
      options.apiKey
    );
    return { ...result, usedFallback: false };
  } catch (error) {
    primaryError = error;
  }

  const namedFallback = fallbackProviderConfig(
    envAi.fallbackProvider ?? "",
    effective
  );
  let namedFallbackError: unknown;
  if (namedFallback) {
    const fallbackMax =
      namedFallback.providerId === "groq"
        ? Math.min(
            chatOptions.maxTokens,
            resolveMjMaxTokens("groq", namedFallback.modelId)
          )
        : chatOptions.maxTokens;
    try {
      const result = await completeAgainstConfig(
        namedFallback,
        messages,
        options,
        {
          ...chatOptions,
          maxTokens: fallbackMax,
          retryOnEmpty: isReasoningChatModelId(namedFallback.modelId),
          retryOnTimeout: false,
        },
        options.apiKey
      );
      return { ...result, usedFallback: true };
    } catch (error) {
      namedFallbackError = error;
    }
  }

  if (!config.useFallbackLmStudio || isLocalLlmProvider(effective.providerId)) {
    if (namedFallback && namedFallbackError) {
      throw formatChainedLlmFailure(
        primaryError,
        namedFallback.providerId,
        namedFallbackError
      );
    }
    throw primaryError;
  }

  const fallbackModelId = resolveLmStudioFallbackModelId(
    resolveTaskModelId(effective, taskKind),
    config
  );
  if (!fallbackModelId) {
    throw primaryError;
  }

  const fallbackBase = normalizeLmStudioV1BaseUrl(
    options.lmStudioBaseUrl ?? "http://127.0.0.1:1234/v1"
  );
  const payload = await openAiCompatibleChat(
    fallbackBase,
    undefined,
    fallbackModelId,
    messages,
    {
      ...chatOptions,
      retryOnEmpty: true,
      retryOnTimeout: true,
      extraHeaders: {},
    }
  );
  return {
    ...payload,
    providerId: "lmstudio",
    modelId: fallbackModelId,
    usedFallback: true,
  };
}

/** Alias récit — `completeChat` avec kind narration. */
export async function completeAsMj(
  config: LlmRoomConfig,
  messages: ChatCompletionMessage[],
  options: LlmProviderOptions = {}
): Promise<LlmCompletionResult> {
  return completeChat(config, messages, {
    ...options,
    taskKind: options.taskKind ?? "narration",
  });
}
