import type { CharacterSheet } from "../types.js";

/** Premier objet `{…}` équilibré, y compris dans un bloc markdown. */
export function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fence = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (fence?.[1]) return fence[1];

  const start = trimmed.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === "\"") inStr = false;
      continue;
    }
    if (c === "\"") {
      inStr = true;
      continue;
    }
    if (c === "{") depth += 1;
    if (c === "}") {
      depth -= 1;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  return trimmed.match(/\{[\s\S]*\}/)?.[0] ?? null;
}

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
  const json = extractJsonObject(trimmed);
  if (!json) {
    throw new Error(`Réponse LLM sans JSON (${label})`);
  }
  try {
    const parsed: unknown = JSON.parse(json);
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
