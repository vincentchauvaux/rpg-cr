import type { PlayerIntroFollowUpMode } from "../player-intro-followup-prompt.js";

/** Type de sollicitation narrative — un prompt MJ par kind. */
export type NarrationKind =
  | "player_action"
  | "player_say"
  | "reclaim_continue"
  | "player_start"
  | "player_continue"
  | "hint"
  | "set_piece"
  | "host_preamble"
  | "host_recap"
  | "player_intro_manual"
  | "player_intro_auto"
  | "circle_introduce"
  | "circle_withdraw";

/** Contexte minimal pour assembler un prompt MJ (données sérialisables). */
export interface NarrationContext {
  kind: NarrationKind;
  locale?: string;

  /** PJ à l'origine du déclenchement */
  playerName?: string;
  /** Texte d'action ou de parole (Dire / Action) */
  actionText?: string;
  /** Précision libre (Réclamer, indice, etc.) */
  optionalText?: string;
  /** Capacités / objets utiles (fiche) — actions uniquement */
  abilitiesHint?: string;

  /** Salon et monde */
  roomName?: string;
  hostName?: string;
  worldSeed?: string;
  sceneSummary?: string;
  trameSummary?: string;
  readyPlayersBlock?: string;
  journalSummary?: string;
  recentChatSummary?: string;
  loreSnippet?: string;
  /** Noms des compagnons actifs à la table */
  companionsPresent?: string[];

  /** Options scène / trame / campagne */
  hasEstablishedScene?: boolean;
  hasNarrativeArc?: boolean;
  campaignOpeningDone?: boolean;

  /** Entrée en scène */
  playerIntroMode?: PlayerIntroFollowUpMode;
  isBriefGreeting?: boolean;
}
