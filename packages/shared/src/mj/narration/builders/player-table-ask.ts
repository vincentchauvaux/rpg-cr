import type { NarrationContext } from "../types.js";

/** Question table (« on est où ? ») — une seule réponse de lieu, pas un mashup. */
export function buildPlayerTableAskNarration(ctx: NarrationContext): string {
  const name = ctx.playerName ?? "Le joueur";
  const content = ctx.actionText?.trim() ?? "";
  const sceneBlock = ctx.sceneSummary?.trim()
    ? `\n### Scène archivée\n${ctx.sceneSummary.trim()}`
    : "\n### Scène archivée\n(non établie)";
  const lastMj = ctx.recentChatSummary?.trim()
    ? `\n### Dernier récit MJ (priorité si déplacement)\n${ctx.recentChatSummary.trim()}`
    : "";

  return (
    `[QUESTION TABLE — orientation]\n` +
    `${name} demande (au MJ / à la table, **pas** à un PNJ) : « ${content} »\n\n` +
    `## Consignes MJ (obligatoire)\n` +
    `- C'est une question de **repère** : où est le groupe **maintenant**, et **qui est le PJ** selon sa fiche.\n` +
    `- **Un seul lieu.** Interdit de mêler deux décors (ex. vent autour de la taverne **et** porte de cabane).\n` +
    `- Source de vérité : le **dernier récit MJ** s'il pose un déplacement ; sinon la scène archivée. Pas d'invention de ville, cabane ou taverne absente de ces sources.\n` +
    `- **Fiche = canon** : si le PJ a un rang (sergent…) et des hommes / une suite, ils **existent**. Dis où ils sont (à tes côtés, en faction, à 20 pas) — **interdit** de répondre « tu n'as pas de compagnons » si la fiche en a.\n` +
    `- **2–4 phrases** sobres à la 2e personne. Ne reformule pas le dernier paragraphe (vent, feuilles, serrure… déjà lus).\n` +
    `- Pas de liste de 3 options. Une question courte suffit si un choix réel existe déjà dans la scène.\n` +
    `- Ne fais pas réagir la foule : ce n'est pas une parole in-world pour les PNJ.` +
    sceneBlock +
    lastMj
  );
}
