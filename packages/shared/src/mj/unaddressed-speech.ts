/** Lieux où du monde est normalement à portée d'oreille. */
export const SOCIAL_SCENE_RE =
  /\b(taverne|auberge|estaminet|bar|marché|bazar|foire|place(?:\s+publique)?|rue|ruelle|quai|port|salle(?:\s+commune)?|hall|cour|temple|église|chapelle|auberge|hostel|plaza|forum|agora|cantine|réfectoire|guilde|échoppe|boutique)\b/iu;

export function sceneLooksCrowded(location?: string, mood?: string): boolean {
  return SOCIAL_SCENE_RE.test(location ?? "") || SOCIAL_SCENE_RE.test(mood ?? "");
}

export function uniqueListenerNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const n = raw.trim();
    if (n.length < 2) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/**
 * Hint MJ : parole sans @ — le monde entend.
 * 1 auditeur nommé → iel peut répondre ; plusieurs → on peut demander à qui ça s'adresse.
 */
export function buildUnaddressedSayHint(
  listeners: string[],
  crowdPresent: boolean
): string {
  const named = uniqueListenerNames(listeners);
  if (named.length === 1) {
    return (
      `- Le PJ n'a **apostrophé personne** (@). À portée : **${named[0]}** seulement. ` +
      `Iel peut **répondre** (ou ignorer, grogner, selon son caractère) comme si on lui parlait — ` +
      `sauf prière, juron, ou pensée à voix haute clairement pas pour lui.\n`
    );
  }
  if (named.length >= 2) {
    return (
      `- Le PJ n'a **apostrophé personne** (@). Plusieurs personnes entendent : ${named.map((n) => `**${n}**`).join(", ")}. ` +
      `Quelqu'un peut demander **à qui** il s'adresse, se méprendre, ou répondre si le contexte désigne clairement l'un d'eux ` +
      `(ex. la personne qui vient de lui parler). N'invente pas de nouveau PNJ nommé. Ne parle pas à la place des PJ.\n`
    );
  }
  if (crowdPresent) {
    return (
      `- Le PJ n'a **apostrophé personne** (@), mais il y a **du monde** autour (lieu public). ` +
      `Un inconnu, un voisin de table ou un tenancier (**sans** nouveau nom canonique) peut demander à qui il parle, ` +
      `ou répondre brièvement s'il n'y a qu'un interlocuteur évident. Prière / juron / aparté : regards, pas forcément une réplique.\n`
    );
  }
  return "";
}

/** Un Dire sans @ mérite un tour MJ s'il y a des auditeurs ou de la foule. */
export function shouldNarrateUnaddressedSay(
  listeners: string[],
  crowdPresent: boolean
): boolean {
  return uniqueListenerNames(listeners).length > 0 || crowdPresent;
}
