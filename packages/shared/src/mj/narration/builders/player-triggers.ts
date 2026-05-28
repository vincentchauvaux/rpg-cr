import { narrationCanonContinuityFooter } from "../../canon-continuity.js";
import type { NarrationContext } from "../types.js";

function optionalBlock(ctx: NarrationContext): string {
  return ctx.optionalText?.trim()
    ? `\n\nPrécision du joueur : « ${ctx.optionalText.trim()} »`
    : "";
}

function sceneHint(ctx: NarrationContext): string {
  return ctx.hasEstablishedScene
    ? ""
    : "\n\nLa scène n'est pas encore archivée : **établis** lieu, ambiance et tension dans le récit, puis mets à jour via le bloc `<!--scene:…-->` si tu l'utilises.";
}

function arcHint(ctx: NarrationContext): string {
  return ctx.hasNarrativeArc
    ? ""
    : "\n\nLa trame principale n'est pas encore posée : annonce objectif, conflit et enjeu ; mets à jour via `<!--arc:…-->` si pertinent.";
}

export function buildPlayerStartNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Un joueur";
  const extra = optionalBlock(ctx);
  const scene = sceneHint(ctx);
  const arc = arcHint(ctx);

  if (ctx.campaignOpeningDone) {
    return (
      `[REPRISE / CONTINUER] ${name} demande au MJ de poursuivre l'aventure.\n\n` +
      "L'ouverture de campagne a déjà été jouée : **ne refais pas** une introduction complète. " +
      "Enchaîne la scène en cours, rappelle brièvement l'enjeu (1 phrase), puis fais avancer le fil (2–4 paragraphes)." +
      extra +
      narrationCanonContinuityFooter()
    );
  }

  return (
    `[DÉMARRAGE DE CAMPAGNE] ${name} invite le MJ à ouvrir l'aventure.\n\n` +
    "Pose une **introduction** forte : lieu concret, atmosphère, tension initiale, et **trame principale** (objectif, conflit, enjeu). " +
    "Varie le cadre (évite ruines/forteresse par défaut). Intègre la carte et les fiches des personnages présents. " +
    "Accroche narrative (2–4 paragraphes), pas de mécanique ni de tutoriel. Ce que tu établis devient canon." +
    scene +
    arc +
    extra +
    narrationCanonContinuityFooter()
  );
}

export function buildPlayerContinueNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Un joueur";
  return (
    `[CONTINUER LE RÉCIT] ${name} demande au MJ de faire avancer l'histoire.\n\n` +
    "Poursuis le fil narratif et la **trame principale** sans répéter ce qui vient d'être dit. " +
    "Fais évoluer un PNJ ou l'environnement si pertinent (1–3 paragraphes). **Conserve** lieu, ambiance et tension archivés sauf événement majeur ; pas de bloc `<!--scene:…-->` si rien ne change." +
    optionalBlock(ctx) +
    narrationCanonContinuityFooter()
  );
}

export function buildHintNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Un joueur";
  return (
    `[INDICE DISCRET] ${name} sollicite une aide narrative légère.\n\n` +
    "Donne un indice subtil lié à la trame ou à la scène : détail d'environnement, intuition d'un PNJ, ou piste indirecte — sans spoiler brutal ni solution complète. " +
    "1–2 paragraphes maximum, ton immersif." +
    optionalBlock(ctx) +
    narrationCanonContinuityFooter()
  );
}

export function buildReclaimContinueNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Un joueur";
  return (
    `[RÉCLAMER — SILENCE DU JOUEUR] ${name} ne prend pas la parole ; le MJ enrichit la scène.\n\n` +
    "Le joueur observe ou attend. Développe la situation **sans changer de lieu** ni de tension archivée, sauf conséquence majeure : réactions du monde ou des PNJ, détails sensoriels. " +
    "Ne force pas d'action du personnage. Pas de bloc `<!--scene:…-->` si lieu et tension restent les mêmes. 1–3 paragraphes.\n" +
    "- Si des compagnons ou PNJ sont présents **sans rôle établi**, décris regards, tension ou attente **sans** leur inventer un titre (princesse, roi, etc.)." +
    sceneHint(ctx) +
    optionalBlock(ctx) +
    narrationCanonContinuityFooter()
  );
}
