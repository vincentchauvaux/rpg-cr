import { getCatalogEntry } from "./catalog.js";
import { assertChatModelId } from "./model-kind.js";
import { normalizeLmStudioV1BaseUrl } from "./lmstudio-url.js";
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

const DEFAULT_TIMEOUT_MS = 120_000;
const JIT_RETRY_DELAY_MS = 6_000;
const JIT_MAX_ATTEMPTS = 2;

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

function lmStudioChecklist(modelId: string): string {
  return (
    `Checklist LM Studio pour « ${modelId} » :\n` +
    "• Identifiant exact — copier depuis la sidebar ou `curl http://127.0.0.1:1234/v1/models`\n" +
    "• Modèle **READY** (pas « Loading ») — JIT : attendre 30–90 s après un changement\n" +
    "• Serveur LM Studio **Running**, URL `http://127.0.0.1:1234/v1`\n" +
    "• God mode → **Enregistrer la config** → **Tester la connexion**\n" +
    "• Si ça persiste : décharger/recharger le modèle dans LM Studio, puis relancer `npm run dev`"
  );
}

export function formatLlmHttpError(
  status: number,
  bodyText: string,
  modelId: string,
  baseUrl: string
): string {
  let parsed: ChatCompletionResponse = {};
  try {
    parsed = JSON.parse(bodyText) as ChatCompletionResponse;
  } catch {
    /* corps non JSON */
  }

  const errMsg = parsed.error?.message?.trim();
  const errCode = parsed.error?.code;

  if (status === 404 || errCode === "model_not_found") {
    return (
      `Modèle introuvable « ${modelId} » sur ${baseUrl}. ` +
      "Copiez l'id **exact** affiché dans LM Studio (sidebar) ou via GET /v1/models — " +
      "souvent sans suffixe @quantization (ex. `qwen2.5-7b-instruct-1m`)."
    );
  }

  if (status === 408 || status === 504) {
    return (
      `Délai dépassé (${status}) pour « ${modelId} » — le modèle charge peut-être encore (JIT). ` +
      "Attendez READY puis réessayez « Tester la connexion »."
    );
  }

  if (errMsg) {
    return `LLM ${status} (${modelId}) : ${errMsg.slice(0, 280)}`;
  }

  return `LLM ${status} (${modelId}) : ${bodyText.slice(0, 200) || "erreur sans détail"}`;
}

export function formatEmptyLlmResponseError(
  modelId: string,
  data: ChatCompletionResponse
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

  return `Réponse LLM vide pour « ${modelId} ».\n${lmStudioChecklist(modelId)}`;
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
  maxTokens: number
): Promise<ChatAttemptResult> {
  assertChatModelId(modelId);

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

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
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        ok: false,
        empty: false,
        error: new Error(
          `Délai dépassé (${Math.round(timeoutMs / 1000)} s) en appelant « ${modelId} » sur ${baseUrl}. ` +
            "Le modèle charge peut-être encore (JIT) — attendez READY dans LM Studio puis retestez."
        ),
      };
    }
    const hint =
      baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost")
        ? " Vérifiez que LM Studio tourne (serveur Running, modèle READY). CORS LM Studio : inutile (seule l'API appelle LM Studio)."
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
        `Réponse LLM illisible (JSON invalide) pour « ${modelId} ». ${lmStudioChecklist(modelId)}`
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

async function openAiCompatibleChat(
  baseUrl: string,
  apiKey: string | undefined,
  modelId: string,
  messages: ChatCompletionMessage[],
  options: { timeoutMs: number; retryOnEmpty: boolean; maxTokens: number }
): Promise<string> {
  let lastEmptyData: ChatCompletionResponse = {};
  const attempts = options.retryOnEmpty ? JIT_MAX_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await openAiCompatibleChatOnce(
      baseUrl,
      apiKey,
      modelId,
      messages,
      options.timeoutMs,
      options.maxTokens
    );

    if (result.ok) return result.content;

    if (result.empty) {
      lastEmptyData = result.data;
      if (attempt < attempts) {
        devLogLlm("retry", `empty response — attempt ${attempt}/${attempts}, wait ${JIT_RETRY_DELAY_MS}ms`);
        await sleep(JIT_RETRY_DELAY_MS);
        continue;
      }
      throw new Error(formatEmptyLlmResponseError(modelId, lastEmptyData));
    }

    throw result.error;
  }

  throw new Error(formatEmptyLlmResponseError(modelId, lastEmptyData));
}

export async function completeAsMj(
  config: LlmRoomConfig,
  messages: ChatCompletionMessage[],
  options: LlmProviderOptions = {}
): Promise<LlmCompletionResult> {
  const entry = getCatalogEntry(config.providerId);
  if (!entry) throw new Error(`Provider inconnu: ${config.providerId}`);

  const rawBase = config.baseUrl ?? entry.defaultBaseUrl ?? "https://api.openai.com/v1";
  const primaryBase =
    config.providerId === "lmstudio" ? normalizeLmStudioV1BaseUrl(rawBase) : rawBase;
  const apiKey = options.apiKey;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTokens = options.maxTokens ?? 2048;
  const retryOnEmpty =
    options.retryOnEmpty ?? config.providerId === "lmstudio";

  assertChatModelId(config.modelId);

  try {
    const content = await openAiCompatibleChat(
      primaryBase,
      apiKey,
      config.modelId,
      messages,
      { timeoutMs, retryOnEmpty, maxTokens }
    );
    return {
      content,
      providerId: config.providerId,
      modelId: config.modelId,
      usedFallback: false,
    };
  } catch (primaryError) {
    if (!config.useFallbackLmStudio || config.providerId === "lmstudio") {
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
      { timeoutMs, retryOnEmpty: true, maxTokens }
    );
    return {
      content,
      providerId: "lmstudio",
      modelId: config.modelId || "local-model",
      usedFallback: true,
    };
  }
}
