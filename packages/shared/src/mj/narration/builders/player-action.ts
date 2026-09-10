import type { NarrationContext } from "../types.js";
import { playerMessageDeclaresRoll } from "../../../dice-roll.js";
import {
  COMPANION_INVITE_MJ_HINT,
  COMPANION_ONGOING_MJ_HINT,
  messageLooksLikeCompanionInvite,
} from "../../../companion-pact.js";

export function buildPlayerActionNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Le joueur";
  const action = ctx.actionText?.trim() ?? "";
  const abilities = ctx.abilitiesHint?.trim() ? `\n${ctx.abilitiesHint.trim()}` : "";
  const declaresRoll = playerMessageDeclaresRoll(action);
  const isTableCheck = /\*\*Épreuve\*\*\s*:|Jet D&D 5e|Tour de table — choix de scène|\*\*→\s*|Résultat\s*:/i.test(
    action
  );
  const isRound = /Tour de table — choix de scène/i.test(action);
  const rollBlock =
    isTableCheck
      ? `\n### Épreuve déjà résolue (dés lancés)\n` +
        `Les dés D&D 5e ont **déjà été lancés** par le système (test de caractéristique, avantage si aide, jet contesté si opposition).\n\n` +
        `**Instructions** :\n` +
        `1. Le résultat final est déjà donné (ex: "**→ réussite**" ou "**→ échec**"). **Pars de ce résultat** — ne lance pas d'autre dé.\n` +
        `2. **Raconte immédiatement** ce qui se passe : réussite = l'action aboutit (selon le degré) ; échec = complication, refus, ou coût ; égalité = statu quo.\n` +
        `3. Si d'autres PJ ont aidé/opposé/laissé faire : fais-les exister brièvement (un geste, un regard). "Laissé faire" ≠ opposition.\n` +
        (isRound
          ? `4. **Tour de table** : narre **un beat unique** avec toutes les actions déclarées simultanément. Les "Options non retenues" **n'ont pas eu lieu** — ne les mentionne pas.\n`
          : `4. Ne redemande pas de jet ; concentre-toi sur les conséquences narratives.\n`) +
        `5. Vouvoie/tutoie les PJ — ce sont des **héros**, pas des PNJ du décor.\n`
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
      ? `\n### Autres présents\n${ctx.companionsPresent.join("\n")}`
      : "";
  const invite =
    ctx.companionInvite === true || messageLooksLikeCompanionInvite(action);

  return (
    `[ACTION — ${name}]\n` +
    `${name} **effectue une action** : « ${action} »${abilities}\n\n` +
    `## Consignes MJ\n` +
    `- **Interprète** l'action demandée et intègre-la au fil narratif en cours (conséquences, réactions du monde, vrais PNJ).\n` +
    `- Parle à **${name}** et aux autres PJ à la **2e personne** (tu / vous). Ce sont des héros de la table, **pas** des PNJ.\n` +
    `- Calibre la longueur et le ton : **1–2 paragraphes sobres** si l'action est simple ou la scène calme ; **2–4 paragraphes** seulement si l'action est dramatique, risquée ou change vraiment la situation — pas de lyrisme gratuit.\n` +
    `- **N'explique pas deux fois** la même situation : ne reformule pas le dernier récit MJ ; narre seulement la **conséquence** de cette action.\n` +
    `- Ne rédige **pas** un chapitre entier sauf si l'action le justifie clairement.\n` +
    `- Résous partiellement ou totalement selon le contexte ; propose un **jet de dés** si l'issue est incertaine et qu'aucun total n'a déjà été annoncé ; si les dés de table ont parlé, **ne redemande pas** de jet.\n` +
    `- Tiens compte des compagnons présents et de la scène archivée ; ce que tu établis devient **canon**.\n` +
    `- Pas de tutoriel ni de mécanique hors jeu ; ton immersif en français.` +
    (invite ? COMPANION_INVITE_MJ_HINT : COMPANION_ONGOING_MJ_HINT) +
    rollBlock +
    sceneBlock +
    trameBlock +
    companions
  );
}
