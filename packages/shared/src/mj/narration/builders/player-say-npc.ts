import type { NarrationContext } from "../types.js";
import {
  COMPANION_INVITE_MJ_HINT,
  COMPANION_ONGOING_MJ_HINT,
  messageLooksLikeCompanionInvite,
} from "../../../companion-pact.js";

/** Réaction d'un PNJ apostrophé au Dire — fidèle au rôle, y compris un silence bourru. */
export function buildPlayerSayNpcNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Le joueur";
  const content = ctx.actionText?.trim() ?? "";
  const npcs = (ctx.addressedNpcNames ?? []).map((n) => n.trim()).filter(Boolean);
  const npcList = npcs.length ? npcs.map((n) => `**${n}**`).join(", ") : "le PNJ apostrophé";
  const isQuestion = /\?/.test(content);
  const invite =
    ctx.companionInvite === true || messageLooksLikeCompanionInvite(content);

  const sceneBlock = ctx.sceneSummary?.trim()
    ? `\n### Scène en cours\n${ctx.sceneSummary.trim()}`
    : "";
  const companions =
    ctx.companionsPresent && ctx.companionsPresent.length > 0
      ? `\n### Autres présents\n${ctx.companionsPresent.join("\n")}`
      : "";

  return (
    `[DIRE — apostrophe PNJ]\n` +
    `${name} s'adresse à ${npcList} : « ${content} »\n\n` +
    `## Consignes MJ\n` +
    `- Interprète **uniquement** la réaction de ${npcList} (et le monde immédiat autour d'eux). Ne résous pas une action physique : c'est de la parole.\n` +
    `- Parle à **${name}** à la **2e personne** (tu / vous). ${name} n'est **pas** un PNJ.\n` +
    `- Reste fidèle au rôle déjà établi : un PNJ bourru, hautain, peureux, ivre ou occupé peut **ignorer**, grogner, couper court, mentir, ou répondre à côté. Ce n'est pas un échec — c'est du jeu.\n` +
    (isQuestion
      ? `- C'est une **question** : ${npcList} y réagit selon ce qu'il **sait**, ce qu'il **veut** dire, et son humeur — pas d'omniscience, pas d'obligation d'être utile.\n`
      : `- Même sans question, donne une réaction perceptible (regard, geste, réplique, ou mépris assumé).\n`) +
    `- N'invente pas d'autre PNJ nommé hors canon. Dialogues en « … ». 1–3 paragraphes sobres, français, immersif.` +
    (invite ? COMPANION_INVITE_MJ_HINT : COMPANION_ONGOING_MJ_HINT) +
    sceneBlock +
    companions
  );
}
