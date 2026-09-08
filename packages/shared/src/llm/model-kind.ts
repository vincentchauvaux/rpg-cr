import { isVisionLanguageModelId } from "./model-context-tier.js";

/** Modèle LM Studio / OpenAI — chat vs embeddings (heuristique sur l'id). */

export type LmModelKind = "chat" | "embedding" | "unknown";

const EMBEDDING_ID_PATTERNS: RegExp[] = [
  /embed/i,
  /embedding/i,
  /nomic-embed/i,
  /text-embedding/i,
  /\bbge[-_/]/i,
  /\be5[-_/]/i,
  /minilm/i,
  /sentence-transformer/i,
  /vector/i,
];

export const EMBEDDING_MODEL_ERROR =
  "Ce modèle est un modèle d'embeddings (vecteurs), pas un modèle de chat. " +
  "Choisissez un modèle de conversation (ex. qwen2.5-7b-instruct, gemma, llama, hermes) dans LM Studio.";

export const UNSUITABLE_MJ_VL_MODEL_ERROR =
  "Les modèles « vision » (VL, multimodal) ne conviennent pas au MJ texte et plantent souvent sous charge. " +
  "Dans LM Studio, chargez plutôt un modèle **instruct/chat** (ex. qwen2.5-7b-instruct, llama-3.1-8b-instruct).";

export function classifyModelId(modelId: string): LmModelKind {
  const id = modelId.trim();
  if (!id) return "unknown";
  if (isEmbeddingModelId(id)) return "embedding";
  return "chat";
}

export function isEmbeddingModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;
  return EMBEDDING_ID_PATTERNS.some((re) => re.test(id));
}

export function isChatModelId(modelId: string): boolean {
  const kind = classifyModelId(modelId);
  return kind === "chat";
}

/**
 * Modèles qui consomment d'abord un budget « reasoning » (gpt-oss, o-series…).
 * Un `max_tokens` trop bas → content vide + finish_reason=length.
 */
export function isReasoningChatModelId(modelId: string): boolean {
  return /gpt-oss|\bo[134](?:-|$)|deepseek-r1|reasoner/i.test(modelId.trim());
}

/** Modèle VL / vision — mauvais choix pour le récit MJ (crash LM Studio fréquents). */
export function isUnsuitableMjModelId(modelId: string): boolean {
  return isVisionLanguageModelId(modelId);
}

/** Lève une erreur explicite si le modèle est clairement un embedding. */
export function assertChatModelId(modelId: string): void {
  if (isEmbeddingModelId(modelId)) {
    throw new Error(`${EMBEDDING_MODEL_ERROR} (id : « ${modelId.trim()} »)`);
  }
}

/** Chat + pas de modèle VL/vision pour les tours MJ. */
export function assertMjSuitableModelId(modelId: string): void {
  assertChatModelId(modelId);
  if (isUnsuitableMjModelId(modelId)) {
    throw new Error(`${UNSUITABLE_MJ_VL_MODEL_ERROR} (id : « ${modelId.trim()} »)`);
  }
}

export function formatEmbeddingModelError(modelId: string): string {
  return `${EMBEDDING_MODEL_ERROR} (id : « ${modelId.trim()} »)`;
}

export interface LmStudioModelEntry {
  id: string;
  kind: LmModelKind;
}

export function classifyLmStudioModelList(ids: string[]): LmStudioModelEntry[] {
  return ids.map((id) => ({ id, kind: classifyModelId(id) }));
}

export function filterChatModelIds(ids: string[]): string[] {
  return ids.filter(
    (id) => classifyModelId(id) !== "embedding" && !isUnsuitableMjModelId(id)
  );
}
