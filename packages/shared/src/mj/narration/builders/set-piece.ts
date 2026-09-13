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
    "Le MJ développe une **séquence dramatique** : suis le curseur Style du récit du salon (plus long seulement si le tournant le justifie). " +
    "Intègre la scène archivée, les PJ présents et la trame ; propose des jets si des choix risqués apparaissent." +
    brief
  );
}
