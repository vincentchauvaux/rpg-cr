/** Fenêtre de contexte estimée pour adapter la taille des prompts MJ. */

export type ModelContextTier = "small" | "medium" | "large";

const SMALL_CONTEXT_PATTERNS: RegExp[] = [
  /\b[12348]b\b/i,
  /-4b/i,
  /-3b/i,
  /-2b/i,
  /-1\.?\d*b/i,
  /\bmini\b/i,
  /\bnano\b/i,
  /\btiny\b/i,
  /-vl-/i,
  /\bvl-\d/i,
  /qwen3-vl/i,
  /phi-?3\.?mini/i,
  /smollm/i,
  /gemma-?3n/i,
];

const MEDIUM_CONTEXT_PATTERNS: RegExp[] = [
  /\b7b\b/i,
  /\b8b\b/i,
  /-7b/i,
  /-8b/i,
  /mistral-7/i,
  /llama-?3\.?1-?8/i,
];

export function inferModelContextTier(modelId: string): ModelContextTier {
  const id = modelId.trim();
  if (!id) return "large";
  if (SMALL_CONTEXT_PATTERNS.some((re) => re.test(id))) return "small";
  if (MEDIUM_CONTEXT_PATTERNS.some((re) => re.test(id))) return "medium";
  return "large";
}

export function isVisionLanguageModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  return /-vl|vision|multimodal|qwen3-vl/i.test(id);
}

export function formatSmallContextModelHint(modelId: string): string {
  const id = modelId.trim();
  let hint =
    "Ce modèle a une petite fenêtre de contexte — RPG-CR envoie un prompt réduit automatiquement.";
  if (isVisionLanguageModelId(id)) {
    hint +=
      " Les modèles « VL » (vision) conviennent mal au MJ : préférez un modèle **instruct/chat** (ex. qwen2.5-7b-instruct) dans LM Studio.";
  }
  hint +=
    " Dans LM Studio, chargez le modèle avec une **longueur de contexte** plus grande (8k+) si disponible.";
  return hint;
}

export function initialMjContextModeForModel(modelId: string): "full" | "slim" | "micro" {
  const tier = inferModelContextTier(modelId);
  if (tier === "small") return "micro";
  if (tier === "medium") return "slim";
  return "full";
}
