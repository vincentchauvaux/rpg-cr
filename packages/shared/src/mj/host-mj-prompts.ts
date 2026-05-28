import { buildNarrationPrompt } from "./narration/index.js";

/** Déclencheurs MJ réservés à l'hôte (admin) */
export type MjHostTriggerType = "preamble" | "session_recap";

export const MJ_HOST_TRIGGER_TYPES: MjHostTriggerType[] = [
  "preamble",
  "session_recap",
];

export function isMjHostTriggerType(value: string): value is MjHostTriggerType {
  return (MJ_HOST_TRIGGER_TYPES as string[]).includes(value);
}

export type MjHostReclaimChoice = MjHostTriggerType | "reclaim";

/** Contexte minimal pour choisir le type de sollicitation MJ (hôte). */
export interface HostReclaimRoomState {
  lastPreambleAt?: string | null;
  campaignOpeningDone?: boolean;
}

/**
 * Choix automatique du type MJ quand l'hôte clique « Réclamer ».
 * - Préambule : jamais de préambule enregistré OU ouverture de campagne non faite
 * - Récap : campagne ouverte, historique chat, une fois par session navigateur
 * - Sinon : continuer le récit (`reclaim`)
 */
export function pickHostMjPromptType(
  room: HostReclaimRoomState,
  messageCount: number,
  recapOfferedThisSession: boolean
): MjHostReclaimChoice {
  const hasPreamble = Boolean(room.lastPreambleAt?.trim());
  if (!room.campaignOpeningDone) {
    return "preamble";
  }
  if (!hasPreamble) {
    return "reclaim";
  }
  if (
    room.campaignOpeningDone &&
    messageCount > 0 &&
    !recapOfferedThisSession
  ) {
    return "session_recap";
  }
  return "reclaim";
}

/** Clé sessionStorage : récap déjà proposé pour ce salon dans l'onglet courant. */
export function hostRecapSessionStorageKey(roomId: string): string {
  return `rpg-cr-recap-done:${roomId}`;
}

export function isMjPromptTriggerType(
  value: string
): value is MjHostTriggerType | import("./player-mj-prompts.js").MjPlayerTriggerType {
  return (
    isMjHostTriggerType(value) ||
    (["start", "continue", "hint", "reclaim"] as string[]).includes(value)
  );
}

export interface HostMjPromptContext {
  roomName: string;
  hostName: string;
  worldSeed: string;
  sceneSummary: string;
  trameSummary: string;
  readyPlayersBlock: string;
  journalSummary: string;
  recentChatSummary: string;
  loreSnippet?: string;
}

function hostContextToNarration(ctx: HostMjPromptContext) {
  return {
    roomName: ctx.roomName,
    hostName: ctx.hostName,
    worldSeed: ctx.worldSeed,
    sceneSummary: ctx.sceneSummary,
    trameSummary: ctx.trameSummary,
    readyPlayersBlock: ctx.readyPlayersBlock,
    journalSummary: ctx.journalSummary,
    recentChatSummary: ctx.recentChatSummary,
    loreSnippet: ctx.loreSnippet,
  };
}

export function buildHostPreamblePrompt(ctx: HostMjPromptContext): string {
  return buildNarrationPrompt({
    kind: "host_preamble",
    ...hostContextToNarration(ctx),
  });
}

export function buildSessionRecapPrompt(ctx: HostMjPromptContext): string {
  return buildNarrationPrompt({
    kind: "host_recap",
    ...hostContextToNarration(ctx),
  });
}
