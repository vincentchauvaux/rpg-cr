import { narrationCanonContinuityFooter } from "../../canon-continuity.js";
import type { NarrationContext } from "../types.js";

export function buildCircleIntroduceNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Le personnage";
  return (
    `[CERCLE NARRATIF] Le personnage « ${name} » rejoint la scène — c'est une marionnette IA que tu incarnes ou fais entrer dans l'histoire.\n\n` +
    "Introduis-le (ou la) de façon narrative et organique (1–3 paragraphes). Ne parle pas de « IA » ni de mécanique." +
    narrationCanonContinuityFooter()
  );
}

export function buildCircleWithdrawNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Le personnage";
  return (
    `[CERCLE NARRATIF] Le personnage « ${name} » quitte le cercle narratif actif (retrait, pas mort forcée).\n\n` +
    "Fais-le sortir de l'histoire avec élégance (1–2 paragraphes). Ne parle pas de boutons ni de mécanique." +
    narrationCanonContinuityFooter()
  );
}
