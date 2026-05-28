import type { NarrationContext, NarrationKind } from "./types.js";
import { narrationCanonContinuityFooter } from "../canon-continuity.js";
import { buildPlayerActionNarration } from "./builders/player-action.js";
import { buildPlayerSayNarration } from "./builders/player-say.js";
import {
  buildPlayerStartNarration,
  buildPlayerContinueNarration,
  buildHintNarration,
  buildReclaimContinueNarration,
} from "./builders/player-triggers.js";
import { buildHostPreambleNarration, buildHostRecapNarration } from "./builders/host.js";
import {
  buildPlayerIntroManualNarration,
  buildPlayerIntroAutoNarration,
} from "./builders/player-intro.js";
import { buildCircleIntroduceNarration, buildCircleWithdrawNarration } from "./builders/circle.js";
import { buildSetPieceNarration } from "./builders/set-piece.js";

/** Point d'entrée unique pour tous les prompts MJ « narration ». */
export function buildNarrationPrompt(ctx: NarrationContext): string {
  const body = buildNarrationPromptBody(ctx);
  return body + narrationCanonContinuityFooter();
}

function buildNarrationPromptBody(ctx: NarrationContext): string {
  switch (ctx.kind) {
    case "player_action":
      return buildPlayerActionNarration(ctx);
    case "player_say":
      return buildPlayerSayNarration(ctx);
    case "player_start":
      return buildPlayerStartNarration(ctx);
    case "player_continue":
      return buildPlayerContinueNarration(ctx);
    case "hint":
      return buildHintNarration(ctx);
    case "reclaim_continue":
      return buildReclaimContinueNarration(ctx);
    case "host_preamble":
      return buildHostPreambleNarration(ctx);
    case "host_recap":
      return buildHostRecapNarration(ctx);
    case "player_intro_manual":
      return buildPlayerIntroManualNarration(ctx);
    case "player_intro_auto":
      return buildPlayerIntroAutoNarration(ctx);
    case "circle_introduce":
      return buildCircleIntroduceNarration(ctx);
    case "circle_withdraw":
      return buildCircleWithdrawNarration(ctx);
    case "set_piece":
      return buildSetPieceNarration(ctx);
    default: {
      const _exhaustive: never = ctx.kind;
      return _exhaustive;
    }
  }
}

export { buildNarrationPromptBody };

export function narrationKindForPlayerTrigger(
  type: "start" | "continue" | "hint" | "reclaim"
): NarrationKind {
  switch (type) {
    case "start":
      return "player_start";
    case "continue":
      return "player_continue";
    case "hint":
      return "hint";
    case "reclaim":
      return "reclaim_continue";
  }
}
