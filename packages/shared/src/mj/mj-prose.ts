/** Curseur salon : 0 = droit au but, 100 = romancé. Défaut plutôt factuel. */
export const MJ_PROSE_MIN = 0;
export const MJ_PROSE_MAX = 100;
export const MJ_PROSE_DEFAULT = 20;

export type MjProseBand = "blunt" | "sober" | "lush";

export function normalizeMjProse(value?: number | null): number {
  if (value == null || !Number.isFinite(value)) return MJ_PROSE_DEFAULT;
  return Math.min(MJ_PROSE_MAX, Math.max(MJ_PROSE_MIN, Math.round(value)));
}

export function mjProseBand(value?: number | null): MjProseBand {
  const n = normalizeMjProse(value);
  if (n <= 33) return "blunt";
  if (n <= 66) return "sober";
  return "lush";
}

export function mjProseLabel(value?: number | null): string {
  switch (mjProseBand(value)) {
    case "blunt":
      return "Droit au but";
    case "sober":
      return "Sobre";
    case "lush":
      return "Romancé";
  }
}

export function mjProseHint(value?: number | null): string {
  switch (mjProseBand(value)) {
    case "blunt":
      return "Phrases courtes, un seul lieu, deux traits qui comptent — pas un tapis de métaphores.";
    case "sober":
      return "Récit de table oral : un ou deux détails sensoriels, sans lyrisme.";
    case "lush":
      return "Plus d'ambiance et de style, sans inventer de PNJ ni de secrets.";
  }
}

/** Consignes injectées dans le prompt MJ selon le curseur du salon. */
export function formatMjProseRules(value?: number | null): string {
  const n = normalizeMjProse(value);
  const band = mjProseBand(n);
  const head = `## Style du récit (réglage salon : ${n}/100 — ${mjProseLabel(n)})`;

  if (band === "blunt") {
    return `${head}
- **Droit au but.** 1–3 paragraphes courts. Sujet–verbe–complément. **Règle des deux** : deux traits par chose, un bruit ou une odeur, un mouvement — puis stop.
- **Un seul lieu** par message. Nomme-le clairement (l'auberge, la caserne, la place du marché) — pas une enfilade ruelle + chapelle + brume.
- **Interdit** : tapis de métaphores (« comme si les murs parlaient »), accumulations de murmures / ombres dansantes / parfums / brumes qui vibrent. **Interdit** d'écrire l'émotion du PJ (« tu as peur »).
- **Interdit** : PNJ **nommé** absent de la fiche (pas de « Sir Aldric » surgissant). Figurant anonyme OK (« un forgeron », « la tenancière»).
- **Interdit** : secrets familiaux, destin, vérité sur le père/la mère, prophétie — sauf si c'est **écrit sur la fiche**.
- L'ouverture : tu es déjà là, tu fais ce que dit ta fiche. Un incident **concret et petit** (bruit, message, altercation). Pas un roman.`;
  }

  if (band === "lush") {
    return `${head}
- Style plus ample autorisé (3–5 paragraphes). Toujours **deux traits** par chose, plus de chair sensorielle, **une** comparaison si elle paie.
- Reste ancré : **un lieu à la fois**, pas de PNJ nommé hors fiche, pas de secret familial inventé.
- Évite de répéter le même motif (murmure, brume, ombre) à chaque phrase. N'impose pas l'émotion du PJ.`;
  }

  return `${head}
- Ton de table **sobre** : 2–4 paragraphes courts. **Règle des deux** + un sens hors la vue + un mouvement.
- Un seul lieu. Pas de catalogue poétique. Pas de PNJ nommé hors fiche. Pas de secret inventé (père, destin) absent de la fiche.
- Incident déclencheur concret, pas une allégorie. Le PJ sent ; tu ne lui dictes pas « tu es angoissé ».`;
}

const ORNATE_RE =
  /comme si|semblent?\b|murmur|ombres dansantes|vibre|cœur qui bat|coeur qui bat|parfum de|lueurs argent|pierres anciennes/gi;

/** Trop de remplissage poétique alors que le salon demande du factuel. */
export function openingTooOrnate(content: string, mjProse?: number | null): boolean {
  if (mjProseBand(mjProse) === "lush") return false;
  const t = content.replace(/<!--[\s\S]*?-->/g, "");
  const hits = t.match(ORNATE_RE)?.length ?? 0;
  if (mjProseBand(mjProse) === "blunt") return hits >= 3;
  return hits >= 6;
}

const PLACE_WORDS = [
  "ruelle",
  "chapelle",
  "auberge",
  "taverne",
  "caserne",
  "marché",
  "temple",
  "rivière",
  "campement",
  "forteresse",
  "sanctuaire",
];

/** Trop de décors distincts dans le même Acte I. */
export function openingTooManyPlaces(content: string, mjProse?: number | null): boolean {
  if (mjProseBand(mjProse) === "lush") return false;
  const t = content.replace(/<!--[\s\S]*?-->/g, "").toLowerCase();
  const hits = PLACE_WORDS.filter((w) => t.includes(w));
  return hits.length >= 3;
}

export function withNormalizedMjProse<T extends { mjProse?: number }>(config: T): T {
  return { ...config, mjProse: normalizeMjProse(config.mjProse) };
}
