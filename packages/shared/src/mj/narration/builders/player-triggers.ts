import type { NarrationContext } from "../types.js";
import { COMPANION_ONGOING_MJ_HINT } from "../../../companion-pact.js";

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
      extra
    );
  }

  return (
    `[DÉMARRAGE DE CAMPAGNE] ${name} invite le MJ à ouvrir l'aventure.\n\n` +
    "L'Acte I auto n'a pas encore été joué : ouvre **comme une ouverture de campagne**, pas un second préambule. " +
    "Un lieu, 2e personne, incident concret, pas de PNJ nommé hors fiche, pas de roman." +
    scene +
    arc +
    extra
  );
}

export function buildPlayerContinueNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Un joueur";
  return (
    `[CONTINUER LE RÉCIT] ${name} demande au MJ de faire avancer l'histoire.\n\n` +
    "Poursuis le fil narratif et la **trame principale** sans répéter ni paraphraser ce qui vient d'être dit. " +
    "Fais évoluer un PNJ ou l'environnement si pertinent (1–3 paragraphes). **Conserve** lieu, ambiance et tension archivés sauf événement majeur ; pas de bloc `<!--scene:…-->` si rien ne change." +
    COMPANION_ONGOING_MJ_HINT +
    optionalBlock(ctx)
  );
}

export function buildHintNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Un joueur";
  return (
    `[INDICE DISCRET] ${name} sollicite une aide narrative légère.\n\n` +
    "Donne un indice subtil lié à la trame ou à la scène : détail d'environnement, intuition d'un PNJ, ou piste indirecte — sans spoiler brutal ni solution complète. " +
    "1–2 paragraphes maximum, ton immersif." +
    optionalBlock(ctx)
  );
}

export function buildReclaimContinueNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Un joueur";
  return (
    `[RÉCLAMER — SILENCE DU JOUEUR] ${name} ne prend pas la parole ; le MJ enrichit la scène.\n\n` +
    "Le joueur observe ou attend. **Ton sobre** : pas de grandiloquence si rien ne bouge — un détail **inédit**, une réplique de PNJ jamais dite, une horloge qui avance. " +
    "**N'explique pas à nouveau** ce qui se passe déjà (lieu, attente, regards) : les joueurs viennent de le lire. " +
    "Développe **sans changer de lieu** ni de tension archivée, sauf conséquence majeure. Ne force pas d'action du personnage. Pas de bloc `<!--scene:…-->` si rien ne change. **1–2 paragraphes** (3 max si événement net).\n" +
    "- Si des compagnons ou PNJ sont présents **sans rôle établi**, décris regards, tension ou attente **sans** leur inventer un titre (princesse, roi, etc.)." +
    COMPANION_ONGOING_MJ_HINT +
    sceneHint(ctx) +
    optionalBlock(ctx)
  );
}
