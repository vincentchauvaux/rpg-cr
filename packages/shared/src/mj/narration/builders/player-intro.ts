import { narrationCanonContinuityFooter } from "../../canon-continuity.js";
import type { NarrationContext } from "../types.js";

export function buildPlayerIntroManualNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Le joueur";
  const quoted = ctx.actionText?.trim() ?? "";
  const briefHint = ctx.isBriefGreeting
    ? "\n- C'est un simple salut : **une courte réplique** in-world (1 paragraphe max), sans scène d'arrivée ni biographie."
    : "\n- Si la présentation reste courte ou vague, accueille sans compléter passé, secrets ou rang à sa place.";

  return (
    `[ENTRÉE EN SCÈNE — PRÉSENTATION JOUEUR]\n` +
    `« ${name} » vient d'entrer en scène avec ses propres mots : « ${quoted} »\n\n` +
    "Le joueur a choisi de **se présenter lui-même**. Tu NE dois PAS :\n" +
    "- inventer ni compléter son passé, background, secrets, rang ou motivations ;\n" +
    "- narrer son arrivée physique (portes, caravane, taverne, etc.) s'il ne l'a pas décrite ;\n" +
    "- rédiger sa présentation à sa place ni résumer toute sa fiche.\n" +
    "Tu PEUX :\n" +
    "- réagir brièvement dans le fil en cours (1–2 paragraphes courts) à ce qu'il a **réellement** dit ;\n" +
    "- l'inviter **une fois**, sobrement, à en dire plus quand il voudra — sans inventer le contenu." +
    briefHint +
    "\n\nNe modifie pas lieu ni tension sauf événement majeur explicite." +
    narrationCanonContinuityFooter()
  );
}

export function buildPlayerIntroAutoNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Le joueur";
  const quoted = ctx.actionText?.trim() ?? "";

  return (
    `[ENTRÉE EN SCÈNE — PRÉSENTATION AUTO]\n` +
    `« ${name} » s'est présenté avec le texte suivant : « ${quoted} »\n\n` +
    "Accueille-le brièvement dans la scène (1–2 paragraphes). **Ne répète pas** ni n'allonge sa présentation. " +
    "N'ajoute pas de biographie tirée de la fiche qu'il n'a pas dite à voix haute." +
    narrationCanonContinuityFooter()
  );
}
