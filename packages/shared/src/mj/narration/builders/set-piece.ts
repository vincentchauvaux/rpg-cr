import { narrationCanonContinuityFooter } from "../../canon-continuity.js";
import type { NarrationContext } from "../types.js";

/**
 * Séquence narrative longue (boss, révélation, embuscade) — réservé aux sollicitations explicites.
 */
export function buildSetPieceNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "La table";
  const brief = ctx.optionalText?.trim()
    ? `\n\nBrief : « ${ctx.optionalText.trim()} »`
    : "";

  return (
    `[SÉQUENCE NARRATIVE — ${name}]\n\n` +
    "Le MJ développe une **séquence dramatique** : 4–8 paragraphes, rythme cinématographique, tension montante. " +
    "Intègre la scène archivée, les PJ présents et la trame ; propose des jets si des choix risqués apparaissent." +
    brief +
    narrationCanonContinuityFooter()
  );
}
