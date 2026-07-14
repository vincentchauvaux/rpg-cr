import type { CharacterSheet } from "../types.js";
import { formatCharacterSheetForMj } from "../character-sheet.js";
import { buildGenerationLocaleRules } from "../locale.js";

const STORY_JSON_EXAMPLE = `{
  "alignment": "lawful_good",
  "rank": "string",
  "background": "string",
  "family": "string",
  "secret": "string",
  "ambition": "string"
}`;

const ABILITIES_JSON_EXAMPLE = `{
  "spells": [{ "name": "string", "description": "string", "uses": "string" }],
  "attackTypes": [{ "name": "string", "damage": "string", "range": "string", "description": "string" }],
  "actions": [{ "name": "string", "description": "string", "type": "combat|social|exploration|other" }]
}`;

const MATERIAL_JSON_EXAMPLE = `{
  "inventory": "string",
  "equipment": "string",
  "possessions": "string",
  "habitat": "string",
  "servants": "string",
  "money": "string",
  "mount": "string",
  "notes": "string",
  "usableItems": [{ "name": "string", "description": "string", "quantity": "string", "fromInventory": "string" }]
}`;

function sheetContextBlock(playerName: string, sheet: CharacterSheet): string {
  const existing = formatCharacterSheetForMj(playerName, sheet).trim();
  return existing ? `Fiche en cours :\n${existing.slice(0, 3500)}\n\n` : "";
}

export function buildCharacterStoryPhaseMessages(
  currentSheet: CharacterSheet,
  playerName: string,
  worldContext: string,
  hints?: string,
  preferredLocale?: string
): { role: "system" | "user"; content: string }[] {
  const hintBlock = hints?.trim() ? `\n\nIndications du joueur :\n${hints.trim()}` : "";
  return [
    {
      role: "system",
      content:
        "Tu es le MJ d'une campagne médiéval-fantasy. Invente l'identité narrative du personnage : alignement, rang, historique, famille, secret, ambition. " +
        "Cohérence et concision. Réponds UNIQUEMENT avec un objet JSON valide.\n" +
        buildGenerationLocaleRules(preferredLocale),
    },
    {
      role: "user",
      content:
        `Personnage : « ${playerName} ».\n\n` +
        (worldContext ? `Contexte campagne :\n${worldContext}\n\n` : "") +
        sheetContextBlock(playerName, currentSheet) +
        hintBlock +
        `\n\nJSON attendu :\n${STORY_JSON_EXAMPLE}`,
    },
  ];
}

export function buildCharacterAbilitiesPhaseMessages(
  currentSheet: CharacterSheet,
  playerName: string,
  worldContext: string,
  preferredLocale?: string
): { role: "system" | "user"; content: string }[] {
  return [
    {
      role: "system",
      content:
        "Tu es le MJ. Propose sorts, modes d'attaque et actions cohérents avec la fiche déjà établie. " +
        "Au plus 2 sorts, 2 attaques, 2 actions si pertinent. JSON uniquement.\n" +
        buildGenerationLocaleRules(preferredLocale),
    },
    {
      role: "user",
      content:
        `Personnage : « ${playerName} ».\n\n` +
        (worldContext ? `Contexte :\n${worldContext.slice(0, 1500)}\n\n` : "") +
        sheetContextBlock(playerName, currentSheet) +
        `\n\nJSON attendu :\n${ABILITIES_JSON_EXAMPLE}`,
    },
  ];
}

export function buildCharacterMaterialPhaseMessages(
  currentSheet: CharacterSheet,
  playerName: string,
  worldContext: string,
  preferredLocale?: string
): { role: "system" | "user"; content: string }[] {
  return [
    {
      role: "system",
      content:
        "Tu es le MJ. Décris biens matériels, argent, monture, inventaire — alignés sur le rang et l'historique du personnage. " +
        "Au plus 2 objets utilisables si pertinent. JSON uniquement.\n" +
        buildGenerationLocaleRules(preferredLocale),
    },
    {
      role: "user",
      content:
        `Personnage : « ${playerName} ».\n\n` +
        (worldContext ? `Contexte :\n${worldContext.slice(0, 1500)}\n\n` : "") +
        sheetContextBlock(playerName, currentSheet) +
        `\n\nJSON attendu :\n${MATERIAL_JSON_EXAMPLE}`,
    },
  ];
}
