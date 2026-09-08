import { getCatalogEntry, isOpenRouterProvider } from "./catalog.js";
import { estimatePromptChars, resolveLlmTimeoutMs } from "./context-budget.js";
import { assertChatModelId, isUnsuitableMjModelId } from "./model-kind.js";
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
  abortSignal: AbortSignal | undefined,
  sampling: { temperature: number; jsonMode: boolean },
  extraHeaders: Record<string, string> = {},
  allowJsonModeRetry = true
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
        false
      );
    }
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
    temperature: number;
    jsonMode: boolean;
    extraHeaders?: Record<string, string>;
  }
): Promise<string> {
  let lastEmptyData: ChatCompletionResponse = {};
  const emptyAttempts = options.retryOnEmpty ? JIT_MAX_ATTEMPTS : 1;
  const timeoutAttempts = options.retryOnTimeout ? 2 : 1;
  const maxAttempts = Math.max(emptyAttempts, timeoutAttempts);
  const sampling = { temperature: options.temperature, jsonMode: options.jsonMode };
  const extraHeaders = options.extraHeaders ?? {};

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
      options.abortSignal,
      sampling,
      extraHeaders
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
): Promise<{ content: string; providerId: string; modelId: string }> {
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

  const content = await openAiCompatibleChat(baseUrl, apiKey, modelId, messages, {
    ...chatOptions,
    extraHeaders,
  });
  return { content, providerId: config.providerId, modelId };
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
  const maxTokens = options.maxTokens ?? profile.maxTokens;
  const retryOnEmpty =
    options.retryOnEmpty ?? isLocalLlmProvider(effective.providerId);
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
  if (namedFallback) {
    try {
      const result = await completeAgainstConfig(
        namedFallback,
        messages,
        options,
        {
          ...chatOptions,
          retryOnEmpty: false,
          retryOnTimeout: false,
        },
        options.apiKey
      );
      return { ...result, usedFallback: true };
    } catch {
      /* dernier recours : LM Studio / Ollama local */
    }
  }

  if (!config.useFallbackLmStudio || isLocalLlmProvider(effective.providerId)) {
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
  const content = await openAiCompatibleChat(
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
    content,
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
