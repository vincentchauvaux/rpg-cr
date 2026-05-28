/** Règles MJ communes — continuité narrative / anti-invention. */
export const MJ_CANON_CONTINUITY_RULES = `## Continuité narrative (priorité haute)
- N'invente **aucun** personnage, titre (princesse, prince, roi, reine, duc, duchesse…), relation, secret, quête ou lieu **non** établi dans le contexte (faits canon, éléments établis, messages précédents, ouverture, scène archivée).
- Si tu n'es pas certain qu'un rôle ou titre a été dit à la table, décris des réactions **neutres** : « ils attendent ta réponse » — **pas** « la princesse attend ta réponse ».
- Pour les PJ : utilise **uniquement** les noms des fiches joueurs ; n'attribue pas de titres ou rangs inventés (sauf si le joueur, le canon ou un message précédent les a explicitement établis).
- Tu peux enrichir ambiance et détails sensoriels ; tu ne peux pas introduire de nouveaux éléments diegétiques majeurs (PNJ nommés, révélations, missions) sans base dans le contexte.`;

export interface EstablishedCanonInput {
  /** Noms PJ humains prêts — seuls noms de personnage joueur autorisés */
  playerNames: string[];
  /** Bloc formaté des faits narratifs (ex. formatNarrativeFactsForMj) */
  narrativeFactsBlock: string;
  sceneBlock?: string;
  arcBlock?: string;
}

/** Résumé compact injecté dans runMjTurn — ce qui est déjà « vrai » à la table. */
export function formatEstablishedCanonSummary(input: EstablishedCanonInput): string {
  const parts: string[] = [];

  if (input.playerNames.length) {
    parts.push(
      `**Noms PJ à la table** (seuls noms de PJ autorisés) : ${input.playerNames.join(", ")}.`
    );
  } else {
    parts.push(
      "**Noms PJ** : aucun PJ prêt — ne nomme pas de personnage joueur inventé."
    );
  }

  const facts = input.narrativeFactsBlock.trim();
  const hasFacts =
    facts.length > 0 && !facts.toLowerCase().includes("aucun fait canon");
  if (hasFacts) {
    parts.push(`**Faits canon (MJ)** :\n${facts}`);
  } else {
    parts.push(
      "**Faits canon** : aucun fait extrait encore — ne nomme pas de titres (princesse, roi…) ni de PNJ majeurs non mentionnés dans le chat, l'ouverture ou la scène archivée."
    );
  }

  const scene = input.sceneBlock?.trim();
  if (scene && !scene.includes("non établie")) {
    parts.push(`**Scène archivée** :\n${scene}`);
  }

  const arc = input.arcBlock?.trim();
  if (arc && !arc.includes("non posée")) {
    parts.push(`**Trame** :\n${arc}`);
  }

  return parts.join("\n\n");
}

/** Bloc court à ajouter en fin de prompts « narration » (le détail est dans le contexte monde). */
export function narrationCanonContinuityFooter(): string {
  return `\n\n${MJ_CANON_CONTINUITY_RULES}`;
}
