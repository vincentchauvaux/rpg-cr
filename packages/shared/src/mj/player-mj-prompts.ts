import {
  buildNarrationPrompt,
  narrationKindForPlayerTrigger,
} from "./narration/index.js";

/** Déclencheurs MJ sollicités par les joueurs à la table */
export type MjPlayerTriggerType = "start" | "continue" | "hint" | "reclaim";

export const MJ_PLAYER_TRIGGER_TYPES: MjPlayerTriggerType[] = [
  "start",
  "continue",
  "hint",
  "reclaim",
];

export function isMjPlayerTriggerType(value: string): value is MjPlayerTriggerType {
  return (MJ_PLAYER_TRIGGER_TYPES as string[]).includes(value);
}

export interface PlayerMjPromptOptions {
  /** Scène déjà archivée (lieu renseigné) */
  hasEstablishedScene?: boolean;
  /** Trame principale déjà posée */
  hasNarrativeArc?: boolean;
  /** Ouverture de campagne déjà jouée au démarrage */
  campaignOpeningDone?: boolean;
}

export function buildPlayerMjPrompt(
  type: MjPlayerTriggerType,
  playerName: string,
  optionalText?: string,
  options: PlayerMjPromptOptions = {}
): string {
  return buildNarrationPrompt({
    kind: narrationKindForPlayerTrigger(type),
    playerName,
    optionalText,
    hasEstablishedScene: options.hasEstablishedScene,
    hasNarrativeArc: options.hasNarrativeArc,
    campaignOpeningDone: options.campaignOpeningDone,
  });
}
