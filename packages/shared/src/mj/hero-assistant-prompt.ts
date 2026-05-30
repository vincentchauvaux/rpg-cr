import type { ChatCompletionMessage } from "../llm/providers.js";
import { formatCharacterSheetForMj } from "../character-sheet.js";
import type { CharacterSheet } from "../types.js";
import { buildGenerationLocaleRules, normalizeLocale } from "../locale.js";
import { MJ_CANON_CONTINUITY_RULES } from "./canon-continuity.js";

export type HeroAssistantMode = "creation" | "play";

export interface HeroAssistantPromptInput {
  playerName: string;
  sheet: CharacterSheet;
  question: string;
  mode: HeroAssistantMode;
  /** Messages publics récents du salon (témoin du PJ) */
  recentTableLines?: string[];
  /** Bloc canon établi (déjà formaté) */
  establishedCanonBlock?: string;
  preferredLocale?: string;
}

export function buildHeroAssistantMessages(
  input: HeroAssistantPromptInput
): ChatCompletionMessage[] {
  const loc = normalizeLocale(input.preferredLocale);
  const modeHint =
    input.mode === "creation"
      ? "Le joueur crée encore sa fiche : aide-le à remplir rang, passé, secrets, ambitions — pose des questions courtes si besoin."
      : "Le joueur est en jeu : réponds comme une aide intime au héros, pas comme le MJ de table.";

  const system = [
    "Tu es l'**aide personnelle** du personnage joueur (conseiller intérieur, pas le Maître du Jeu public).",
    modeHint,
    "",
    "Règles strictes :",
    "- Tu ne racontes PAS la scène à sa place : pas de `[ACTION]`, pas de jets, pas de dialogue PNJ inventé.",
    "- Tu t'appuies sur : la fiche du héros, ce qu'il a vécu à la table (messages récents), le canon établi.",
    "- Tu ne révèles que ce que le **héros peut raisonnablement savoir** (souvenirs, fiche, conversations entendues).",
    "- Si une information n'est pas établie ou pas accessible au héros, dis-le clairement et propose **comment l'obtenir en jeu** (parler à un PNJ, observer, fouiller, Demander au MJ de table via Réclamer pour les faits monde, etc.).",
    "- Pas de titres inventés (princesse, complot) s'ils ne figurent pas dans le contexte fourni.",
    "- Réponse courte : 2 à 6 phrases, markdown léger autorisé (`**gras**`, listes courtes).",
    "- Pas de JSON, pas de `<!--scene:-->`, pas de `[VJ]`.",
    MJ_CANON_CONTINUITY_RULES,
    buildGenerationLocaleRules(input.preferredLocale),
  ].join("\n");

  const userParts = [
    `Personnage : **${input.playerName}**`,
    "",
    "### Fiche (passé et présent du héros)",
    formatCharacterSheetForMj(input.playerName, input.sheet),
  ];

  if (input.establishedCanonBlock?.trim()) {
    userParts.push("", input.establishedCanonBlock.trim());
  }

  if (input.recentTableLines?.length) {
    userParts.push(
      "",
      "### Ce qui s'est dit récemment à la table (témoin du héros)",
      input.recentTableLines.join("\n")
    );
  }

  userParts.push(
    "",
    "### Question du joueur",
    input.question.trim(),
    "",
    loc === "en"
      ? "Answer as the hero's personal advisor."
      : "Réponds en conseiller personnel du héros."
  );

  return [
    { role: "system", content: system },
    { role: "user", content: userParts.join("\n") },
  ];
}
