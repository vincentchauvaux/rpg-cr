import type { CharacterSheet } from "../types.js";
import { formatCharacterSheetForMj } from "../character-sheet.js";
import { buildGenerationLocaleRules } from "../locale.js";

const FULL_SHEET_JSON_EXAMPLE = `{
  "alignment": "lawful_good|neutral_good|chaotic_good|lawful_neutral|true_neutral|chaotic_neutral|lawful_evil|neutral_evil|chaotic_evil",
  "rank": "string",
  "background": "string",
  "family": "string",
  "secret": "string",
  "ambition": "string",
  "inventory": "string",
  "equipment": "string",
  "possessions": "string",
  "habitat": "string",
  "servants": "string",
  "money": "string",
  "mount": "string",
  "notes": "string",
  "stats": { "force": 10, "dexterite": 10, "constitution": 10, "intelligence": 10, "sagesse": 10, "charisme": 10 },
  "spells": [{ "name": "string", "description": "string", "uses": "string" }],
  "attackTypes": [{ "name": "string", "damage": "string", "range": "string", "description": "string" }],
  "actions": [{ "name": "string", "description": "string", "type": "combat|social|exploration|other" }],
  "usableItems": [{ "name": "string", "description": "string", "quantity": "string", "fromInventory": "string" }]
}`;

export function buildCharacterAllMessages(
  currentSheet: CharacterSheet,
  playerName: string,
  worldContext: string,
  hints?: string,
  preferredLocale?: string
): { role: "system" | "user"; content: string }[] {
  const existing = formatCharacterSheetForMj(playerName, currentSheet).trim();
  const hintBlock = hints?.trim()
    ? `\n\nIndications du joueur :\n${hints.trim()}`
    : "";

  return [
    {
      role: "system",
      content:
        "Tu es le MJ d'une campagne médiéval-fantasy. Fiche personnage complète mais CONCISE (phrases courtes). " +
        "Cohérence globale (ex. marchand → argent, inventaire, monture alignés). " +
        "Stats 8–16 sauf une force/faiblesse (1–20). Au plus 2 sorts, 2 actions, 2 objets utilisables si pertinent. " +
        "Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni commentaire.\n" +
        buildGenerationLocaleRules(preferredLocale),
    },
    {
      role: "user",
      content:
        `Personnage : « ${playerName} ».\n\n` +
        (worldContext ? `Contexte campagne :\n${worldContext}\n\n` : "") +
        (existing ? `Fiche actuelle (inspiration ou à remplacer) :\n${existing.slice(0, 3000)}\n\n` : "") +
        hintBlock +
        `\n\nGénère la fiche complète au format JSON :\n${FULL_SHEET_JSON_EXAMPLE}`,
    },
  ];
}
