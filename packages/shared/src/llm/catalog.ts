import type { LlmCatalogEntry, LlmCatalogModel, LlmModelRole } from "../types.js";

export const LLM_CATALOG: LlmCatalogEntry[] = [
  {
    id: "openai",
    vendor: "OpenAI",
    name: "OpenAI",
    openAiCompatible: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    characteristics: [
      "Récit MJ : GPT-4o (prose, consignes, table)",
      "Outils : GPT-4o mini (extraction JSON, traduction, moins cher)",
      "Large écosystème",
    ],
    models: [
      {
        id: "gpt-4o",
        label: "GPT-4o (MJ)",
        contextWindow: 128000,
        role: "narration",
      },
      {
        id: "gpt-4o-mini",
        label: "GPT-4o mini (outils)",
        contextWindow: 128000,
        role: "tool",
      },
    ],
  },
  {
    id: "anthropic",
    vendor: "Anthropic",
    name: "Anthropic (via proxy OpenAI)",
    openAiCompatible: true,
    requiresApiKey: true,
    characteristics: [
      "Narration nuancée (Sonnet)",
      "Même modèle pour les outils (température basse + JSON)",
      "Le proxy doit exposer `/v1/chat/completions`",
    ],
    models: [
      {
        id: "claude-sonnet-4-20250514",
        label: "Claude Sonnet",
        contextWindow: 200000,
        role: "both",
      },
    ],
  },
  {
    id: "ollama",
    vendor: "Ollama",
    name: "Ollama (VPS / local)",
    openAiCompatible: true,
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    requiresApiKey: false,
    characteristics: [
      "Gratuit",
      "Sur le VPS — pas de Mac ni tunnel",
      "Défaut RAM-safe : `qwen2.5:7b-instruct`",
      "Si 16 Go+ : Qwen3 instruct 8B/14B (meilleur suivi d'instructions)",
    ],
    models: [
      {
        id: "",
        label: "Nom Ollama — voir ollama list ou GET /v1/models",
        role: "both",
      },
    ],
  },
  {
    id: "lmstudio",
    vendor: "LM Studio",
    name: "LM Studio (Mac + tunnel)",
    openAiCompatible: true,
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    requiresApiKey: false,
    characteristics: [
      "Hors-ligne",
      "Gratuit",
      "Modèle **chat/instruct** requis — pas d'embedding (ex. nomic-embed)",
      "Profil outils = même modèle chargé, température basse",
    ],
    models: [
      {
        id: "",
        label: "Modèle chat/instruct — pas embedding (sidebar LM Studio)",
        role: "both",
      },
    ],
  },
  {
    id: "openrouter",
    vendor: "OpenRouter",
    name: "OpenRouter",
    openAiCompatible: true,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresApiKey: true,
    characteristics: [
      "Un endpoint, des dizaines de modèles (OpenAI, Anthropic, etc.)",
      "Récit : `openai/gpt-4o` — outils : `openai/gpt-4o-mini`",
      "Clé `sk-or-…` : champ god mode ou `OPENROUTER_API_KEY` dans `.env`",
    ],
    models: [
      {
        id: "openai/gpt-4o",
        label: "GPT-4o via OpenRouter (MJ)",
        contextWindow: 128000,
        role: "narration",
      },
      {
        id: "openai/gpt-4o-mini",
        label: "GPT-4o mini via OpenRouter (outils)",
        contextWindow: 128000,
        role: "tool",
      },
      {
        id: "anthropic/claude-sonnet-4",
        label: "Claude Sonnet via OpenRouter",
        contextWindow: 200000,
        role: "both",
      },
    ],
  },
  {
    id: "groq",
    vendor: "Groq",
    name: "Groq (gratuit)",
    openAiCompatible: true,
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    requiresApiKey: true,
    characteristics: [
      "Clé `GROQ_API_KEY` serveur uniquement — jamais le navigateur",
      "API officielle OpenAI-compatible (`api.groq.com`)",
      "Défaut production : `openai/gpt-oss-20b` — surcharge `AI_MODEL`",
      "Vérifier `GET /openai/v1/models` si un id disparaît",
    ],
    models: [
      {
        id: "openai/gpt-oss-20b",
        label: "GPT-OSS 20B (rapide)",
        contextWindow: 131072,
        role: "both",
      },
      {
        id: "openai/gpt-oss-120b",
        label: "GPT-OSS 120B (MJ)",
        contextWindow: 131072,
        role: "narration",
      },
      {
        id: "qwen/qwen3.6-27b",
        label: "Qwen3.6 27B",
        contextWindow: 131072,
        role: "both",
      },
    ],
  },
  {
    id: "gemini",
    vendor: "Google",
    name: "Google Gemini (gratuit)",
    openAiCompatible: true,
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    requiresApiKey: true,
    characteristics: [
      "Clé `GEMINI_API_KEY` serveur uniquement — jamais le navigateur",
      "API officielle Gemini (endpoint OpenAI-compatible Google)",
      "Défaut Flash : `gemini-3.8-flash` — surcharge `AI_MODEL`",
    ],
    models: [
      {
        id: "gemini-3.8-flash",
        label: "Gemini 3.8 Flash (rapide)",
        contextWindow: 1048576,
        role: "both",
      },
      {
        id: "gemini-flash-latest",
        label: "Gemini Flash (alias latest)",
        contextWindow: 1048576,
        role: "both",
      },
    ],
  },
];

export function getCatalogEntry(providerId: string): LlmCatalogEntry | undefined {
  return LLM_CATALOG.find((e) => e.id === providerId);
}

export function isOpenRouterProvider(providerId: string): boolean {
  return providerId === "openrouter";
}

function modelRole(model: LlmCatalogModel): LlmModelRole {
  return model.role ?? "both";
}

function namedModels(entry: LlmCatalogEntry | undefined): LlmCatalogModel[] {
  return (entry?.models ?? []).filter((m) => m.id.trim());
}

export function catalogModelsForRole(
  entry: LlmCatalogEntry | undefined,
  role: LlmModelRole
): LlmCatalogModel[] {
  return namedModels(entry).filter((m) => {
    const r = modelRole(m);
    if (role === "both") return true;
    return r === role || r === "both";
  });
}

/** Modèle MJ recommandé (premier `narration`, sinon `both`). */
export function defaultNarrationModelId(entry: LlmCatalogEntry | undefined): string {
  const models = namedModels(entry);
  const preferred =
    models.find((m) => modelRole(m) === "narration") ??
    models.find((m) => modelRole(m) === "both") ??
    models[0];
  return preferred?.id ?? "";
}

/** Modèle outils recommandé (premier `tool`, sinon `both`). */
export function defaultToolModelId(entry: LlmCatalogEntry | undefined): string {
  const models = namedModels(entry);
  const preferred =
    models.find((m) => modelRole(m) === "tool") ??
    models.find((m) => modelRole(m) === "both") ??
    models[0];
  return preferred?.id ?? "";
}
