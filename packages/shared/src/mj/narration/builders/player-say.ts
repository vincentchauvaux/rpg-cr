import { narrationCanonContinuityFooter } from "../../canon-continuity.js";
import type { NarrationContext } from "../types.js";

/** Réaction MJ auto sur un message Dire (quand AUTO_MJ_ON_PLAYER_MESSAGES est actif). */
export function buildPlayerSayNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Le joueur";
  const content = ctx.actionText?.trim() ?? "";

  return (
    `[DIRE] ${name} prend la parole : « ${content} »\n\n` +
    "Réponds en tant que MJ à la table : réagis à ce message dans le fil narratif en cours. " +
    "Si c'est un échange entre PJ sans enjeu monde, reste bref ou silencieux (voir « Dialogue entre joueurs »). " +
    "Ce que tu établis devient canon pour la suite." +
    narrationCanonContinuityFooter()
  );
}
