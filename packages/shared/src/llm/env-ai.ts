import type { LlmRoomConfig } from "../types.js";
import {
  defaultNarrationModelId,
  defaultToolModelId,
  getCatalogEntry,
} from "./catalog.js";
import { defaultModelForLocalProvider, isLocalLlmProvider } from "./local-llm.js";

/** Providers cloud dont la clé ne doit jamais transiter par le navigateur. */
export const SERVER_ONLY_API_KEY_PROVIDERS = ["groq", "gemini"] as const;

export type ServerOnlyApiKeyProvider = (typeof SERVER_ONLY_API_KEY_PROVIDERS)[number];

/** Production Groq (vérifié via GET /models 2026-09) — surcharge via `AI_MODEL`. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

/** Flash Gemini actuel (vérifié 2026-09) — surcharge via `AI_MODEL`. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/** Candidats Groq si l'id par défaut disparaît. */
export const GROQ_CHAT_MODEL_CANDIDATES = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
] as const;

export const GROQ_OPENAI_BASE_URL = "https://api.groq.com/openai/v1";
export const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";

export type EnvAiSettings = {
  provider: string | null;
  model: string | null;
  fallbackProvider: string | null;
};

const KNOWN_AI_PROVIDERS = [
  "groq",
  "gemini",
  "lmstudio",
  "ollama",
  "openai",
  "openrouter",
] as const;

export function normalizeAiProviderId(
  raw?: string | null
): (typeof KNOWN_AI_PROVIDERS)[number] | null {
  const v = raw?.trim().toLowerCase();
  if (!v) return null;
  return (KNOWN_AI_PROVIDERS as readonly string[]).includes(v)
    ? (v as (typeof KNOWN_AI_PROVIDERS)[number])
    : null;
}

export function usesServerOnlyApiKey(
  providerId?: string | null
): providerId is ServerOnlyApiKeyProvider {
  return providerId === "groq" || providerId === "gemini";
}

export function serverApiKeyEnvName(providerId: string): string | null {
  if (providerId === "groq") return "GROQ_API_KEY";
  if (providerId === "gemini") return "GEMINI_API_KEY";
  if (providerId === "openrouter") return "OPENROUTER_API_KEY";
  if (providerId === "openai") return "OPENAI_API_KEY";
  return null;
}

export function defaultModelForCloudProvider(providerId: string): string {
  if (providerId === "groq") return DEFAULT_GROQ_MODEL;
  if (providerId === "gemini") return DEFAULT_GEMINI_MODEL;
  return defaultNarrationModelId(getCatalogEntry(providerId));
}

export function readEnvAiSettings(
  env: Record<string, string | undefined> = process.env
): EnvAiSettings {
  return {
    provider: env.AI_PROVIDER?.trim() || null,
    model: env.AI_MODEL?.trim() || null,
    fallbackProvider: env.AI_FALLBACK_PROVIDER?.trim() || null,
  };
}

/**
 * Clé cloud côté serveur uniquement.
 * Groq / Gemini : jamais `requestKey` (god mode / frontend).
 */
export function resolveServerAiApiKey(
  providerId?: string | null,
  requestKey?: string | null,
  env: Record<string, string | undefined> = process.env
): string | undefined {
  if (providerId === "groq") return env.GROQ_API_KEY?.trim() || undefined;
  if (providerId === "gemini") return env.GEMINI_API_KEY?.trim() || undefined;

  const fromRequest = requestKey?.trim();
  if (fromRequest) return fromRequest;

  const openrouter = env.OPENROUTER_API_KEY?.trim();
  const openai = env.OPENAI_API_KEY?.trim();
  if (providerId === "openrouter") return openrouter || openai;
  return openai;
}

export function applyEnvAiOverride(
  config: LlmRoomConfig,
  settings: EnvAiSettings = readEnvAiSettings()
): LlmRoomConfig {
  const provider = normalizeAiProviderId(settings.provider);
  if (!provider) return config;

  if (provider === "groq" || provider === "gemini") {
    const entry = getCatalogEntry(provider);
    const model =
      settings.model?.trim() ||
      defaultNarrationModelId(entry) ||
      defaultModelForCloudProvider(provider);
    const tool =
      settings.model?.trim() || defaultToolModelId(entry) || model;
    return {
      ...config,
      providerId: provider,
      modelId: model,
      toolModelId: tool,
      baseUrl: entry?.defaultBaseUrl ?? config.baseUrl,
    };
  }

  if (isLocalLlmProvider(provider)) {
    const model =
      settings.model?.trim() ||
      config.modelId.trim() ||
      defaultModelForLocalProvider(provider);
    return {
      ...config,
      providerId: provider,
      modelId: model,
      toolModelId: undefined,
    };
  }

  const entry = getCatalogEntry(provider);
  const model =
    settings.model?.trim() ||
    defaultNarrationModelId(entry) ||
    config.modelId;
  return {
    ...config,
    providerId: provider,
    modelId: model,
    toolModelId: defaultToolModelId(entry) || config.toolModelId,
    baseUrl: entry?.defaultBaseUrl ?? config.baseUrl,
  };
}

export function resolveEffectiveLlmConfig(
  config: LlmRoomConfig,
  settings: EnvAiSettings = readEnvAiSettings()
): LlmRoomConfig {
  return applyEnvAiOverride(config, settings);
}

export function fallbackProviderConfig(
  providerId: string,
  base: LlmRoomConfig
): LlmRoomConfig | null {
  const provider = normalizeAiProviderId(providerId);
  if (!provider || provider === base.providerId) return null;
  if (provider !== "groq" && provider !== "gemini") return null;
  const entry = getCatalogEntry(provider);
  const model = defaultModelForCloudProvider(provider);
  return {
    ...base,
    providerId: provider,
    modelId: model,
    toolModelId: model,
    baseUrl: entry?.defaultBaseUrl,
  };
}

export function pickFirstAvailableModel(
  availableIds: string[],
  candidates: readonly string[]
): string | null {
  const set = new Set(availableIds);
  return candidates.find((id) => set.has(id)) ?? availableIds[0] ?? null;
}

export function missingServerApiKeyError(providerId: string): string {
  const envName = serverApiKeyEnvName(providerId);
  if (!envName) return `Clé API manquante pour le provider « ${providerId} ».`;
  return `${envName} manquante côté serveur (jamais exposée au navigateur).`;
}
