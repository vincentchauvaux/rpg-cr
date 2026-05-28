import type { CharacterSheet } from "../types.js";
import {
  type CharacterSheetSectionKey,
  normalizeCharacterSheet,
  STAT_LABELS,
  STAT_KEYS,
} from "../character-sheet.js";
import { buildGenerationLocaleRules } from "../locale.js";
import { getCharacterFieldLabels } from "./character-field-prompt.js";

const SECTION_HINTS: Record<CharacterSheetSectionKey, string> = {
  stats: `Objet JSON stats avec clés : ${STAT_KEYS.join(", ")} (entiers 1-20). Exemple : {"force":14,"dexterite":12}`,
  spells: `Tableau JSON de sorts : [{"name":"...","description":"...","uses":"3/jour"}]`,
  attackTypes: `Tableau JSON : [{"name":"...","damage":"1d8","range":"contact","description":"..."}]`,
  actions: `Tableau JSON : [{"name":"...","description":"...","type":"combat|social|exploration|other"}]`,
  usableItems: `Tableau JSON : [{"name":"...","description":"...","quantity":"2","fromInventory":"ligne inventaire"}]`,
};

export function buildCharacterSectionMessages(
  section: CharacterSheetSectionKey,
  currentSheet: CharacterSheet,
  playerName: string,
  worldContext?: string,
  preferredLocale?: string
): { role: "system" | "user"; content: string }[] {
  const sheet = normalizeCharacterSheet(currentSheet);
  const labels = getCharacterFieldLabels(preferredLocale);
  const filled = [
    sheet.rank && `${labels.rank} : ${sheet.rank}`,
    sheet.background && `${labels.background} : ${sheet.background}`,
    sheet.inventory && `${labels.inventory} : ${sheet.inventory}`,
    sheet.equipment && `${labels.equipment} : ${sheet.equipment}`,
  ]
    .filter(Boolean)
    .join("\n");

  const statContext =
    section === "stats"
      ? STAT_KEYS.map((k) => `${STAT_LABELS[k]} (${k})`).join(", ")
      : "";

  return [
    {
      role: "system",
      content: `Tu aides à remplir une fiche personnage JDR médiéval-fantastique.
Personnage : ${playerName}.
${worldContext ? `\nContexte monde :\n${worldContext.slice(0, 2000)}` : ""}

Réponds UNIQUEMENT avec le JSON demandé, sans markdown ni commentaire.
${buildGenerationLocaleRules(preferredLocale)}
Les champs "name" et "description" dans le JSON doivent respecter la langue demandée.`,
    },
    {
      role: "user",
      content: `Champs déjà remplis :\n${filled || "—"}

Section à générer : ${section}
${statContext ? `Caractéristiques (labels) : ${statContext}\n` : ""}
Format attendu :
${SECTION_HINTS[section]}

Cohérence avec l'historique et l'inventaire. Style sobre médiéval.`,
    },
  ];
}
