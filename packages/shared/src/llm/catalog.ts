import type { LlmCatalogEntry } from "../types.js";

export const LLM_CATALOG: LlmCatalogEntry[] = [
  {
    id: "openai",
    vendor: "OpenAI",
    name: "OpenAI",
    openAiCompatible: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    characteristics: [
      "Réponses rapides",
      "Large écosystème",
      "Modèles généralistes et raisonnement",
    ],
    models: [
      { id: "gpt-4o", label: "GPT-4o", contextWindow: 128000 },
      { id: "gpt-4o-mini", label: "GPT-4o mini", contextWindow: 128000 },
    ],
  },
  {
    id: "anthropic",
    vendor: "Anthropic",
    name: "Anthropic (via proxy OpenAI)",
    openAiCompatible: true,
    requiresApiKey: true,
    characteristics: [
      "Narration nuancée",
      "Long contexte (selon modèle)",
      "Configurer un proxy compatible OpenAI",
    ],
    models: [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet", contextWindow: 200000 },
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
      "Modèle chat/instruct (`ollama pull qwen2.5:7b-instruct`)",
    ],
    models: [
      {
        id: "",
        label: "Nom Ollama — voir ollama list ou GET /v1/models",
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
      "Fallback automatique si le marché échoue",
    ],
    models: [
      {
        id: "",
        label: "Modèle chat/instruct — pas embedding (sidebar LM Studio)",
      },
    ],
  },
];

export function getCatalogEntry(providerId: string): LlmCatalogEntry | undefined {
  return LLM_CATALOG.find((e) => e.id === providerId);
}
