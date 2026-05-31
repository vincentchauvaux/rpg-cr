import type { NarrationContext } from "../types.js";

export function buildPlayerActionNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Le joueur";
  const action = ctx.actionText?.trim() ?? "";
  const abilities = ctx.abilitiesHint?.trim() ? `\n${ctx.abilitiesHint.trim()}` : "";

  const sceneBlock = ctx.sceneSummary?.trim()
    ? `\n### Scène en cours\n${ctx.sceneSummary.trim()}`
    : "";
  const trameBlock = ctx.trameSummary?.trim()
    ? `\n### Trame\n${ctx.trameSummary.trim()}`
    : "";
  const companions =
    ctx.companionsPresent && ctx.companionsPresent.length > 0
      ? `\n### Compagnons présents\n${ctx.companionsPresent.join(", ")}`
      : "";

  return (
    `[ACTION — ${name}]\n` +
    `${name} **effectue une action** : « ${action} »${abilities}\n\n` +
    `## Consignes MJ\n` +
    `- **Interprète** l'action demandée et intègre-la au fil narratif en cours (conséquences, réactions du monde, PNJ).\n` +
    `- Calibre la longueur et le ton : **1–2 paragraphes sobres** si l'action est simple ou la scène calme ; **2–4 paragraphes** seulement si l'action est dramatique, risquée ou change vraiment la situation — pas de lyrisme gratuit.\n` +
    `- Ne rédige **pas** un chapitre entier sauf si l'action le justifie clairement.\n` +
    `- Résous partiellement ou totalement selon le contexte ; propose un **jet de dés** si l'issue est incertaine (combat, persuasion, discrétion, etc.).\n` +
    `- Tiens compte des compagnons présents et de la scène archivée ; ce que tu établis devient **canon**.\n` +
    `- Pas de tutoriel ni de mécanique hors jeu ; ton immersif en français.` +
    sceneBlock +
    trameBlock +
    companions
  );
}
