import type { NarrationContext } from "../types.js";
import { playerMessageDeclaresRoll } from "../../../dice-roll.js";

export function buildPlayerActionNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Le joueur";
  const action = ctx.actionText?.trim() ?? "";
  const abilities = ctx.abilitiesHint?.trim() ? `\n${ctx.abilitiesHint.trim()}` : "";
  const declaresRoll = playerMessageDeclaresRoll(action);
  const isTableCheck = /Jet D&D 5e|Résultat\s*:/i.test(action);
  const rollBlock =
    isTableCheck
      ? `\n### Jet de dés — épreuve de table (D&D 5e)\n` +
        `Les dés ont **déjà été lancés à la table** (test de caractéristique, éventuellement avantage si un compagnon aide, jet contesté si opposition).\n\n` +
        `**Tu DOIS** :\n` +
        `1. Partir des totaux et du « Résultat » annoncés (ne relance rien, n'invente pas d'autre d20).\n` +
        `2. Narrer **immédiatement** les conséquences concrètes : réussite = le choix aboutit (avec le degré du jet) ; échec ou opposition victorieuse = complication, refus, ou coût ; égalité = la situation ne bascule pas.\n` +
        `3. Si d'autres PJ ont aidé ou se sont opposés, fais-les exister dans la scène (un geste, une réplique, une interférence).\n` +
        `4. Ne redemande pas de jet ; pas de tutoriel mécanique.\n`
      : declaresRoll && ctx.pendingRollRequest?.trim()
      ? `\n### Jet de dés — résolution obligatoire\n` +
        `Le joueur annonce un **résultat chiffré**. Ta demande précédente :\n` +
        `« ${ctx.pendingRollRequest.trim().slice(0, 600)} »\n\n` +
        `**Tu DOIS** :\n` +
        `1. Partir du résultat annoncé par le joueur (dé naturel + modificateur = total).\n` +
        `2. Choisir **une** des issues que tu avais proposées (+2 critique / 0 simple / −2 échec) selon la qualité du jet.\n` +
        `3. Narrer **immédiatement** les conséquences concrètes de cette issue — pas seulement l'ambiance générale.\n` +
        `4. Ne redemande pas de jet ; ne ignore pas le résultat.\n`
      : declaresRoll
        ? `\n### Jet de dés\n` +
          `Le joueur annonce un résultat chiffré — interprète-le et narre les **conséquences directes** de ce jet.\n`
        : "";

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
    `- Résous partiellement ou totalement selon le contexte ; propose un **jet de dés** si l'issue est incertaine et qu'aucun total n'a déjà été annoncé ; si les dés de table ont parlé, **ne redemande pas** de jet.\n` +
    `- Tiens compte des compagnons présents et de la scène archivée ; ce que tu établis devient **canon**.\n` +
    `- Pas de tutoriel ni de mécanique hors jeu ; ton immersif en français.` +
    rollBlock +
    sceneBlock +
    trameBlock +
    companions
  );
}
