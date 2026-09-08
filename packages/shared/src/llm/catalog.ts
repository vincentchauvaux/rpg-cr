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
];

export function getCatalogEntry(providerId: string): LlmCatalogEntry | undefined {
  return LLM_CATALOG.find((e) => e.id === providerId);
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
