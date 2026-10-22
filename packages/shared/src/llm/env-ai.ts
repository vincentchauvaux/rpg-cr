import type { LlmRoomConfig } from "../types.js";
import {
  defaultNarrationModelId,
  getCatalogEntry,
} from "./catalog.js";
import { defaultModelForLocalProvider, isLocalLlmProvider } from "./local-llm.js";

/** Providers cloud dont la clé ne doit jamais transiter par le navigateur. */
export const SERVER_ONLY_API_KEY_PROVIDERS = ["groq", "gemini"] as const;

export type ServerOnlyApiKeyProvider = (typeof SERVER_ONLY_API_KEY_PROVIDERS)[number];

/** Production Groq free : `gpt-oss-20b` (8k TPM). Llama 70B/8B sont souvent « enterprise ». */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

/** Pas de 8B instant (souvent indisponible en free) — extraits Groq en heuristique, pas un 2e modèle. */
export const DEFAULT_GROQ_TOOL_MODEL = "openai/gpt-oss-20b";

/** Flash Gemini actuel (vérifié 2026-09) — surcharge via `AI_MODEL`. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/** Candidats Groq si l'id par défaut disparaît. */
export const GROQ_CHAT_MODEL_CANDIDATES = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
  "groq/compound",
  "llama-3.3-70b-versatile",
] as const;

export const GROQ_OPENAI_BASE_URL = "https://api.groq.com/openai/v1";
export const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";

export type EnvAiSettings = {
  provider: string | null;
  model: string | null;
  toolModel?: string | null;
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
    toolModel: env.AI_TOOL_MODEL?.trim() || null,
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

function configForAutomaticProvider(
  provider: NonNullable<ReturnType<typeof normalizeAiProviderId>>,
  settings: EnvAiSettings,
  base?: Partial<LlmRoomConfig>
): LlmRoomConfig {
  const entry = getCatalogEntry(provider);
  if (provider === "groq") {
    const model = settings.model?.trim() || DEFAULT_GROQ_MODEL;
    return {
      providerId: "groq",
      modelId: model,
      toolModelId: settings.toolModel?.trim() || DEFAULT_GROQ_TOOL_MODEL,
      baseUrl: entry?.defaultBaseUrl,
      useFallbackLmStudio: true,
      autoExtractFacts: base?.autoExtractFacts,
      mjProse: base?.mjProse,
      systemPromptOverride: base?.systemPromptOverride,
    };
  }
  if (provider === "gemini") {
    const model =
      settings.model?.trim() ||
      defaultNarrationModelId(entry) ||
      DEFAULT_GEMINI_MODEL;
    return {
      providerId: "gemini",
      modelId: model,
      toolModelId: settings.toolModel?.trim() || model,
      baseUrl: entry?.defaultBaseUrl,
      useFallbackLmStudio: true,
      autoExtractFacts: base?.autoExtractFacts,
      mjProse: base?.mjProse,
      systemPromptOverride: base?.systemPromptOverride,
    };
  }
  if (isLocalLlmProvider(provider)) {
    const model = settings.model?.trim() || defaultModelForLocalProvider(provider);
    return {
      providerId: provider,
      modelId: model,
      toolModelId: undefined,
      baseUrl: entry?.defaultBaseUrl,
      useFallbackLmStudio: true,
      autoExtractFacts: base?.autoExtractFacts,
      mjProse: base?.mjProse,
      systemPromptOverride: base?.systemPromptOverride,
    };
  }
  const model =
    settings.model?.trim() ||
    defaultNarrationModelId(entry) ||
    "google/gemini-3.8-flash";
  return {
    providerId: provider,
    modelId: model,
    toolModelId: settings.toolModel?.trim() || model,
    baseUrl: entry?.defaultBaseUrl,
    useFallbackLmStudio: true,
    autoExtractFacts: base?.autoExtractFacts,
    mjProse: base?.mjProse,
    systemPromptOverride: base?.systemPromptOverride,
  };
}

/** Chaîne unique : env → premier cloud dispo → Ollama VPS. Plus de choix salon. */
export function listAutomaticLlmCandidates(
  settings: EnvAiSettings = readEnvAiSettings(),
  env: Record<string, string | undefined> = process.env
): LlmRoomConfig[] {
  const out: LlmRoomConfig[] = [];
  const seen = new Set<string>();
  const push = (cfg: LlmRoomConfig) => {
    if (seen.has(cfg.providerId)) return;
    seen.add(cfg.providerId);
    out.push(cfg);
  };

  const preferred = normalizeAiProviderId(settings.provider);
  if (preferred) push(configForAutomaticProvider(preferred, settings));

  if (env.GROQ_API_KEY?.trim()) {
    push(
      configForAutomaticProvider("groq", {
        ...settings,
        provider: "groq",
        model: preferred === "groq" ? settings.model : null,
      })
    );
  }
  if (env.OPENROUTER_API_KEY?.trim()) {
    push(
      configForAutomaticProvider("openrouter", {
        ...settings,
        provider: "openrouter",
        model:
          preferred === "openrouter" && settings.model
            ? settings.model
            : "google/gemini-3.8-flash",
      })
    );
  }
  if (env.GEMINI_API_KEY?.trim()) {
    push(
      configForAutomaticProvider("gemini", {
        ...settings,
        provider: "gemini",
        model:
          settings.model && preferred === "gemini" ? settings.model : null,
      })
    );
  }
  push(
    configForAutomaticProvider("ollama", {
      provider: "ollama",
      model: null,
      fallbackProvider: null,
    })
  );
  return out;
}

export function buildAutomaticLlmConfig(
  room?: Pick<LlmRoomConfig, "mjProse" | "autoExtractFacts" | "systemPromptOverride">,
  settings: EnvAiSettings = readEnvAiSettings(),
  env: Record<string, string | undefined> = process.env
): LlmRoomConfig {
  const primary = listAutomaticLlmCandidates(settings, env)[0];
  return {
    ...primary,
    mjProse: room?.mjProse,
    autoExtractFacts: room?.autoExtractFacts,
    systemPromptOverride: room?.systemPromptOverride,
  };
}

/**
 * Le salon ne choisit plus le fournisseur : env + clés serveur + Ollama.
 * On conserve seulement le style de récit (mjProse) et les faits auto.
 */
export function applyEnvAiOverride(
  config: LlmRoomConfig,
  settings: EnvAiSettings = readEnvAiSettings(),
  env: Record<string, string | undefined> = process.env
): LlmRoomConfig {
  return buildAutomaticLlmConfig(config, settings, env);
}

export function resolveEffectiveLlmConfig(
  config: LlmRoomConfig,
  settings: EnvAiSettings = readEnvAiSettings()
): LlmRoomConfig {
  return applyEnvAiOverride(config, settings);
}

/** Groq free : extraits LLM auto coupés (même plafond TPM que le MJ). */
export function usesTightGroqTpm(
  config: LlmRoomConfig,
  settings: EnvAiSettings = readEnvAiSettings(),
  env: Record<string, string | undefined> = process.env
): boolean {
  if (resolveEffectiveLlmConfig(config, settings).providerId === "groq") return true;
  if (settings.fallbackProvider?.trim().toLowerCase() === "groq") return true;
  return Boolean(env.GROQ_API_KEY?.trim());
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
    toolModelId: provider === "groq" ? DEFAULT_GROQ_TOOL_MODEL : model,
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
