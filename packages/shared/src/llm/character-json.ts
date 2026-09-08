import type { CharacterSheet } from "../types.js";

/**
 * Extrait un objet JSON de fiche depuis la réponse LLM (texte + JSON).
 * Compatible fill-all : pas de texte libre à la place de la fiche.
 */
export function parseCharacterSheetJson(
  raw: string,
  label: string
): Partial<CharacterSheet> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`Réponse LLM vide (${label})`);
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Réponse LLM sans JSON (${label})`);
  }
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`JSON invalide (${label})`);
    }
    return parsed as Partial<CharacterSheet>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("JSON invalide")) {
      throw error;
    }
    throw new Error(`JSON invalide (${label})`);
  }
}
