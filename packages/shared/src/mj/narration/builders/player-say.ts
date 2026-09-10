import type { NarrationContext } from "../types.js";
import { buildUnaddressedSayHint } from "../../unaddressed-speech.js";

/** Réaction MJ à un Dire sans @PNJ — le monde autour peut entendre. */
export function buildPlayerSayNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Le joueur";
  const content = ctx.actionText?.trim() ?? "";
  const sceneBlock = ctx.sceneSummary?.trim()
    ? `\n### Scène en cours\n${ctx.sceneSummary.trim()}`
    : "";
  const companions =
    ctx.companionsPresent && ctx.companionsPresent.length > 0
      ? `\n### Autres présents\n${ctx.companionsPresent.join("\n")}`
      : "";
  const unaddressed = buildUnaddressedSayHint(
    ctx.nearbyListeners ?? [],
    ctx.crowdPresent === true
  );

  return (
    `[DIRE — sans destinataire nommé]\n` +
    `${name} prend la parole sans apostropher personne : « ${content} »\n\n` +
    `## Consignes MJ\n` +
    `- Ce sont des **paroles entendues** dans la scène (pas une Action, pas un aparté système).\n` +
    `- Parle à **${name}** à la **2e personne**. Ne parle pas à la place des autres PJ.\n` +
    `- Si c'est un échange **entre PJ** sans enjeu monde, reste bref ou silencieux.\n` +
    (unaddressed ||
      `- Personne d'évident à portée : au plus un détail d'ambiance, pas d'interlocuteur inventé nommé.\n`) +
    `- 1–2 paragraphes sobres, français, dialogues en « … ». Ce que tu établis devient canon.` +
    sceneBlock +
    companions
  );
}
