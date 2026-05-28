import type { Player } from "./types.js";

/** Couleur pleine dans la liste compagnons : prêt + introduit (humain) ou cercle actif (IA). */
export function isCompanionNarrativelyActive(player: Player): boolean {
  if (player.kind === "ai_puppet") {
    return player.circleStatus === "active";
  }
  return player.characterStatus === "ready" && player.introducedInStory;
}

/** Chat table : humain avec fiche finalisée et entrée narrative MJ jouée. */
export function canHumanParticipateInChat(player: Player): boolean {
  if (player.kind !== "human") return false;
  return player.characterStatus === "ready" && player.introducedInStory;
}

/** Tooltip FR sur une ligne compagnon grisée (undefined si actif). */
export function companionDimTooltip(player: Player): string | undefined {
  if (isCompanionNarrativelyActive(player)) return undefined;
  if (player.kind === "ai_puppet") {
    if (player.circleStatus === "pending") return "Personnage IA en préparation";
    return "Pas encore actif dans le cercle";
  }
  if (player.characterStatus !== "ready") return "Fiche incomplète";
  return "Présentez-vous pour rejoindre la table";
}
