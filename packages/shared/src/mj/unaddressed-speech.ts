/** Lieux où du monde est normalement à portée d'oreille. */
export const SOCIAL_SCENE_RE =
  /\b(taverne|auberge|estaminet|bar|marché|bazar|foire|place(?:\s+publique)?|rue|ruelle|quai|port|salle(?:\s+commune)?|hall|cour|temple|église|chapelle|auberge|hostel|plaza|forum|agora|cantine|réfectoire|guilde|échoppe|boutique)\b/iu;

export function sceneLooksCrowded(location?: string, mood?: string): boolean {
  return SOCIAL_SCENE_RE.test(location ?? "") || SOCIAL_SCENE_RE.test(mood ?? "");
}

/** Rôles qu'on apostrophe sans @ dans une scène (« Tenancière, … », « Patron ! »). */
const VOCATIVE_ROLE =
  "(?:tenanci[eè]re?|tenancier|aubergiste|h[oô]tesse|h[oô]te|patron(?:ne)?|serveur|serveuse|barman|cuisini[eè]re?|forgeron|mar[eé]chal[- ]?ferrant|meunier|boulanger|marchand[e]?|colporteur|garde|milicien|sentinelle|capitaine|sergent|caporal|pr[eê]tre|pr[eê]tresse|cur[eé]|moine|acolyte|guerisseur|gu[eé]risseuse|apothicaire|barde|ménestrel|menestrel|mendiant|gamin|gosse|voisin[e]?|paysan(?:ne)?|berger|chasseur|p[eê]cheur|messire|damoiselle|demoiselle|madame|monsieur|dame|seigneur|ma[iî]tre|ma[iî]tresse|l['’]ami|mon ami|mon brave|mon p[eè]re|ma m[eè]re|ma s[oœ]ur|mon fr[eè]re|vieil homme|vieille|l['’]homme|la femme|petit|petite)";

const VOCATIVE_OPENERS =
  "(?:h[eé]|eh|oh|[oô]|hol[aà]|bonjour|bonsoir|salut|pardon|excusez[- ]moi|dis(?:-moi)?|alors)";

const VOCATIVE_START_RE = new RegExp(
  `^\\s*(?:${VOCATIVE_OPENERS}[\\s,!]+)?(?:ô )?((?:la |le |l['’]|ma |mon )?${VOCATIVE_ROLE})\\s*[,!:;…]`,
  "iu"
);

const VOCATIVE_END_RE = new RegExp(
  `[,;]\\s*((?:la |le |l['’]|ma |mon )?${VOCATIVE_ROLE})\\s*[?!.…]*\\s*$`,
  "iu"
);

/**
 * Parole clairement adressée à quelqu'un de la scène **sans** @ :
 * une apostrophe par rôle en tête (« Tenancière, tu as vu le forgeron ? »)
 * ou en fin (« Le forgeron n'est pas là, patron ? »).
 */
export function extractSpokenVocative(content?: string): string | null {
  const t = content?.trim() ?? "";
  if (!t) return null;
  const hit = VOCATIVE_START_RE.exec(t) ?? VOCATIVE_END_RE.exec(t);
  const role = hit?.[1]?.trim();
  return role ? role.toLowerCase() : null;
}

/** Sucre : la réplique apostrophe un rôle présent. */
export function sayAddressesSomeonePresent(content?: string): boolean {
  return extractSpokenVocative(content) != null;
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
 * 1 auditeur nommé → iel peut répondre ; plusieurs → on peut demander à qui ça s'adresse
 * **sauf** si la réplique désigne déjà les présents (vous / votre / tu).
 */
export function sayLooksDirectedAtHearers(speech?: string): boolean {
  const t = speech?.trim() ?? "";
  if (!t) return false;
  return /\b(vous|votre|vos|tu |t['’]|ton |ta |tes )\b/iu.test(t);
}

export function buildUnaddressedSayHint(
  listeners: string[],
  crowdPresent: boolean,
  speech?: string
): string {
  const named = uniqueListenerNames(listeners);
  const directed = sayLooksDirectedAtHearers(speech);
  const vocative = extractSpokenVocative(speech);
  if (vocative) {
    return (
      `- Le PJ **apostrophe ${vocative}** (sans @, mais l'adresse est explicite). ` +
      `**${vocative} répond** — une réplique entre guillemets qui traite le contenu exact (question, demande, reproche, commande). ` +
      `Si c'est une commande (pichet, chope, plat), **exécute ou refuse cette commande**, ne l'inverse pas. ` +
      `Donne-lui un visage et une voix ; si elle n'a pas encore de nom, un nom simple est permis (c'est un rôle du lieu, pas un PNJ majeur). ` +
      `**Dis qui parle** avant la réplique (un geste suffit : « La tenancière repose son pichet : « … » ») — pas de guillemets orphelins. ` +
      `**Interdit** : répondre en narrateur (« Tu es dans… »), demander « à qui parles-tu ? », ou éluder la question.\n`
    );
  }
  if (named.length === 1) {
    return (
      `- Le PJ n'a **apostrophé personne** (@). À portée : **${named[0]}** seulement. ` +
      `Iel peut **répondre** (ou ignorer, grogner, selon son caractère) comme si on lui parlait — ` +
      `sauf prière, juron, ou pensée à voix haute clairement pas pour lui.\n` +
      (directed
        ? `- La réplique s'adresse clairement à lui (« vous / tu »). **Réagis au contenu exact** (accusation, marchandage, moquerie) — interdit de faire semblant de ne pas savoir à qui ça s'adresse.\n`
        : "")
    );
  }
  if (named.length >= 2) {
    if (directed) {
      return (
        `- Le PJ n'a pas mis de @, mais parle clairement aux gens présents (« vous / votre / tu »). ` +
        `**Celui qui vient de lui parler** (ou le groupe) **réagit au contenu exact** de la réplique. ` +
        `Interdit de demander « à qui tu t'adresses ». N'invente pas de nouveau PNJ nommé.\n`
      );
    }
    return (
      `- Le PJ n'a **apostrophé personne** (@). Plusieurs personnes entendent : ${named.map((n) => `**${n}**`).join(", ")}. ` +
      `Quelqu'un peut demander **à qui** il s'adresse, se méprendre, ou répondre si le contexte désigne clairement l'un d'eux ` +
      `(ex. la personne qui vient de lui parler). N'invente pas de nouveau PNJ nommé. Ne parle pas à la place des PJ.\n`
    );
  }
  if (crowdPresent) {
    if (directed) {
      return (
        `- Le PJ n'a pas mis de @, mais il y a du monde et la réplique s'adresse à eux (« vous / votre »). ` +
        `Un figurant **anonyme** (celui qui vient de parler) **réagit au contenu**. Pas de « à qui tu parles ? ».\n`
      );
    }
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
  crowdPresent: boolean,
  speech?: string
): boolean {
  if (sayAddressesSomeonePresent(speech)) return true;
  return uniqueListenerNames(listeners).length > 0 || crowdPresent;
}
