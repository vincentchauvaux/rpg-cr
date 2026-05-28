import type { CharacterSheet } from "../types.js";
import { formatCharacterSheetForMj } from "../character-sheet.js";
import { buildGenerationLocaleRules } from "../locale.js";

export type LlmChatRole = "system" | "user";

export function buildPlayerSelfIntroMessages(
  playerName: string,
  sheet: CharacterSheet,
  preferredLocale?: string
): { role: LlmChatRole; content: string }[] {
  const sheetBlock = formatCharacterSheetForMj(playerName, sheet);
  return [
    {
      role: "system",
      content: [
        `Tu écris la première prise de parole EN JEU du joueur « ${playerName} » dans une campagne JDR médiévale-fantasy.`,
        buildGenerationLocaleRules(preferredLocale),
        "",
        "Règles :",
        "- 2 à 4 phrases à la première personne, ton immersif.",
        "- Présentation en scène : qui je suis, une accroche ; pas de méta (fiche, joueur, MJ).",
        "- Ne révèle pas tous les secrets de la fiche.",
        "- Pas de guillemets englobant tout le bloc.",
        "",
        "Fiche personnage :",
        sheetBlock,
      ].join("\n"),
    },
    {
      role: "user",
      content: "Écris l'introduction du personnage.",
    },
  ];
}
