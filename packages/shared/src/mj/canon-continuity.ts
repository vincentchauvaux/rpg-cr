/** PJ = héros de la table, jamais des figurants. */
export const MJ_PLAYER_VOICE_RULES = `## Voix : PJ vs PNJ (priorité haute)
- Les **personnages joueurs** (noms des fiches / « Noms PJ à la table ») sont des **héros contrôlés par des humains**, jamais des PNJ ni du décor.
- Adresse-toi à la table à la **2e personne** : « vous » pour le groupe ; « tu » (ou le prénom + tu) pour le PJ qui vient d'agir. Ex. « Tu poses la main sur la table. Autour de vous, la salle se tait. »
- **Interdit** de raconter un PJ à la 3e personne comme un figurant (« Thorin s'approche tandis que vous… », « votre compagnon décide… », « il entre dans la pièce » en parlant d'un PJ). Surtout si un nouveau joueur vient d'arriver : les PJ déjà là restent des « vous », ils ne deviennent pas des PNJ.
- N'invente pas les actes, pensées ou répliques d'un PJ : uniquement ce qu'ils ont dit en [DIRE] ou fait en [ACTION].
- Les marionnettes IA / vrais PNJ se racontent à la 3e personne ; les PJ, jamais.`;

/** Règles MJ communes — continuité narrative / anti-invention. */
export const MJ_CANON_CONTINUITY_RULES = `## Continuité narrative (priorité haute)
- N'invente **aucun** personnage, titre (princesse, prince, roi, reine, duc, duchesse…), relation, secret, quête ou lieu **non** établi dans le contexte (faits canon, éléments établis, messages précédents, ouverture, scène archivée).
- Si tu n'es pas certain qu'un rôle ou titre a été dit à la table, décris des réactions **neutres** : « ils attendent ta réponse » — **pas** « la princesse attend ta réponse ».
- Pour les PJ : utilise **uniquement** les noms des fiches joueurs. Les **rangs, hommes et biens de la fiche** sont canon — n'invente pas un titre **absent** de la fiche, mais **ne nie pas** un sergent / une suite déjà écrits dessus.
- Tu peux enrichir ambiance et détails sensoriels ; tu ne peux pas introduire de nouveaux éléments diegétiques majeurs (PNJ nommés, révélations, missions) sans base dans le contexte.

## Avancer, ne pas paraphraser (obligatoire)
- Chaque tour apporte **du neuf** : un geste, une info, une réplique, un choix. **Interdit** de reformuler le dernier récit (même lieu, même tension, mêmes images).
- Ne re-décris pas le cadre (salle, lumière, bruits, « l'ambiance est tendue ») s'il n'a pas changé — les joueurs l'ont déjà lu.
- Réclamer / Continuer : **enchaîne** (PNJ qui dit une chose inédite, horloge qui avance, détail utile jamais mentionné). Ne réchauffe pas la scène.
- Si peu d'événement : **2–4 phrases** + une question, plutôt qu'un second tableau identique.

## Cohérence spatiale et temporelle (obligatoire)
- **Un seul lieu à la fois.** Interdit de coller deux décors dans le même récit (taverne **et** cabane, ville **et** porte close) comme si le groupe y était simultanément.
- Si les derniers messages disent que vous êtes **devant une porte / une cabane / dehors**, vous n'êtes **pas** « autour de la taverne » — sauf retour explicite dans ce lieu.
- **Positions des personnages** : si un PJ ou PNJ est explicitement sorti, parti, entré ou déplacé dans les messages récents, **respecte ce fait**. Ne le remets pas à l'ancien lieu sans justification.
- Exemple : si « le bard te suit dehors » a été narré, il n'est **plus** à l'auberge — ne dis pas « le bard reste à l'auberge » au message suivant.
- **Lieu de scène** : le contexte « Scène actuelle » est la référence. Si les derniers messages la contredisent (déplacement narré), **les messages récents gagnent**.
- **Actions récentes** : les 3-5 derniers messages établissent l'état actuel (qui est où, qui fait quoi). Ne contredis pas ces faits sans événement narratif qui le justifie (téléportation, flashback explicite, etc.).
- Question « on est où / où en est-on » : **réponds d'abord par le lieu actuel**, 2–4 phrases, sans recycler le dernier paragraphe MJ, sans liste de choix inventée.

${MJ_PLAYER_VOICE_RULES}`;

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
      `**Noms PJ à la table** (héros contrôlés par des joueurs — **jamais** des PNJ ; tutoiement / vouvoiement) : ${input.playerNames.join(", ")}.`
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
