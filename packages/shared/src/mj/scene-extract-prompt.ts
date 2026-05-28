import { clampTension } from "../scene.js";

/** Patch partiel ou signal « rien ne change » (extraction LLM / bloc MJ). */
export interface ScenePatchInput {
  location?: string;
  mood?: string;
  tension?: number;
  unchanged?: boolean;
}

/** Scène complète (valeurs finales après fusion). */
export interface ExtractedScene {
  location: string;
  mood: string;
  tension: number;
}

export const SCENE_TENSION_DELTA_THRESHOLD = 15;

/** Sous ce seuil, l'échelle narrative est « périlleux / danger ». */
export const SCENE_TENSION_PERIL_THRESHOLD = -40;

/** Affichage « danger imminent » : tension au plus à ce seuil (et menace dans le récit récent). */
export const SCENE_TENSION_PERIL_DISPLAY_THRESHOLD = -50;

/** Delta max par patch auto (hors bloc `<!--scene:…-->` explicite). */
export const SCENE_TENSION_STICKY_MAX_DELTA = 15;

const PERIL_MOOD_RE = /danger imminent|péril imminent|menace immédiate/i;

const PERIL_NARRATIVE_RE =
  /\b(combat|attaque|piège|menace|menaçant|péril|danger|mort|sang|blessure|épée|arme|assiège|pourfuit|embuscade|monstre|créature hostile)\b/iu;

const CALM_SOCIAL_RE =
  /\b(rire|plaisanter|bière|chope|chopes|taverne|convivial|bavard|discute|salut|bonjour|merci|amusant|chaleureux|paisible|serein|détendu|repos|fête|festif)\b/iu;

/** Messages joueur très courts : pas d'extraction scène auto (évite réécriture inutile). */
export const SHORT_PLAYER_MESSAGE_MAX_LEN = 32;

export function normalizeSceneLocation(location: string): string {
  return location
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function locationsEquivalent(a: string, b: string): boolean {
  const na = normalizeSceneLocation(a);
  const nb = normalizeSceneLocation(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

/** Types de lieux reconnus (FR médiéval-fantastique + « bar » courant en ouverture). */
export const PLACE_TYPE_WORD =
  /(?:taverne|bar|estaminet|cabaret|brasserie|auberge|marché|carrefour|port|atelier|sanctuaire|tribunal|caravansérail|bergerie|moulin|ruines|forteresse|forêt|citadelle|crypte|village|château|caverne|temple|marais|montagne|plaine|donjon|place|échoppe|boutique|grange|écurie|repaire|manoir|palais|relais|halte|campement|grotte|mine|pont|quai|docks?|cimetière|bibliothèque|académie|guild|cellier|cave|salle|hall|ruelle)/i;

const PLACE_TYPE_CAPTURE =
  "(?:taverne|bar|estaminet|cabaret|brasserie|marché|carrefour|auberge|port|atelier|sanctuaire|tribunal|caravansérail|bergerie|moulin|ruines|forteresse|forêt|citadelle|crypte|village|château|caverne|temple|marais|montagnes?|plaine|donjon|cellier|cave|salle|hall)";

/** Lieu plausible (pas un prénom PJ isolé). */
export function isLikelyPlaceLocation(location: string): boolean {
  const t = location.trim();
  if (!t || t.length < 3) return false;
  if (PLACE_TYPE_WORD.test(t)) return true;
  if (/\s+(?:du|de|des|d')\s+/i.test(t)) return true;
  if (t.split(/\s+/).filter(Boolean).length >= 2) return true;
  return false;
}

/** Retire un lieu qui ressemble à un nom de joueur ou n'est pas un cadre spatial. */
export function scrubScenePatchLocation(
  patch: ScenePatchInput,
  blockedNames: string[] = []
): ScenePatchInput {
  if (!patch.location?.trim()) return patch;

  const loc = patch.location.trim();
  const locNorm = normalizeSceneLocation(loc);

  for (const name of blockedNames) {
    const full = normalizeSceneLocation(name);
    if (!full) continue;
    if (locNorm === full) {
      const { location: _loc, ...rest } = patch;
      return rest;
    }
    const first = normalizeSceneLocation(name.split(/\s+/)[0] ?? "");
    if (first && locNorm === first) {
      const { location: _loc, ...rest } = patch;
      return rest;
    }
  }

  if (!isLikelyPlaceLocation(loc)) {
    const { location: _loc, ...rest } = patch;
    return rest;
  }

  return patch;
}

/** Texte récent contient combat, menace ou danger explicite. */
export function hasExplicitPerilInTexts(texts: string[]): boolean {
  const sample = texts.join("\n").slice(-12000);
  return PERIL_NARRATIVE_RE.test(sample);
}

/** Échange social calme (taverne, banter) sans signal de combat dans les textes fournis. */
export function textsLookLikeCasualSocial(texts: string[]): boolean {
  const sample = texts.join("\n").slice(-12000).trim();
  if (sample.length < 12) return false;
  if (PERIL_NARRATIVE_RE.test(sample)) return false;
  if (CALM_SOCIAL_RE.test(sample)) return true;
  const lines = sample.split(/\n/).filter((l) => l.trim().length > 0);
  const shortLines = lines.filter((l) => l.trim().length <= 120);
  if (shortLines.length >= 2 && shortLines.length / Math.max(lines.length, 1) >= 0.6) {
    return !PERIL_NARRATIVE_RE.test(sample);
  }
  return false;
}

/** Libellé d'ambiance dérivé de la tension archivée. */
export function tensionToDefaultMoodLabel(tension: number): string {
  const t = clampTension(tension);
  if (t <= SCENE_TENSION_PERIL_THRESHOLD) return "danger imminent";
  if (t <= 20) return "tension palpable";
  if (t <= 60) return "ambiance neutre";
  return "calme relatif";
}

export function isPerilMoodLabel(mood: string): boolean {
  return PERIL_MOOD_RE.test(mood.trim());
}

export interface SceneMoodDisplayContext {
  /** Extraits récents MJ + PJ — corrige une ambiance périlleuse figée en SQLite. */
  recentTexts?: string[];
}

/** Affiche-t-on un libellé périlleux (« danger imminent », etc.) ? */
export function shouldShowPerilMoodLabel(
  scene: { mood?: string; tension?: number } | null | undefined,
  ctx: SceneMoodDisplayContext = {}
): boolean {
  const mood = scene?.mood?.trim() ?? "";
  if (!mood || !isPerilMoodLabel(mood)) return false;
  const tension = scene?.tension ?? 0;
  if (tension > SCENE_TENSION_PERIL_DISPLAY_THRESHOLD) return false;
  const texts = ctx.recentTexts ?? [];
  if (texts.length === 0) {
    return tension <= SCENE_TENSION_PERIL_THRESHOLD;
  }
  if (textsLookLikeCasualSocial(texts)) return false;
  return hasExplicitPerilInTexts(texts);
}

/**
 * Libellé ambiance pour l'UI : corrige un « danger imminent » incohérent avec la tension,
 * sinon l'ambiance archivée ou une étiquette dérivée du cadran.
 */
export function getSceneMoodDisplayLabel(
  scene: { mood?: string; tension?: number } | null | undefined,
  ctx: SceneMoodDisplayContext = {}
): string | null {
  const mood = scene?.mood?.trim() ?? "";
  const tension = scene?.tension ?? 0;
  if (!mood && tension === 0) return null;
  if (mood && mood !== "—") {
    if (isPerilMoodLabel(mood) && !shouldShowPerilMoodLabel(scene, ctx)) {
      return tensionToDefaultMoodLabel(tension);
    }
    return mood;
  }
  return tension !== 0 ? tensionToDefaultMoodLabel(tension) : null;
}

export function hasEstablishedSceneMood(
  scene: { mood?: string; tension?: number } | null | undefined
): boolean {
  const label = getSceneMoodDisplayLabel(scene);
  return Boolean(label && label !== "—");
}

export interface ScenePatchScrubContext {
  recentTexts?: string[];
  currentTension?: number;
}

/** Retire ambiance/tension extrêmes si le contexte récent est une conversation sociale calme. */
export function scrubScenePatchMoodAndTension(
  patch: ScenePatchInput,
  ctx: ScenePatchScrubContext = {}
): ScenePatchInput {
  const texts = ctx.recentTexts ?? [];
  const casual = texts.length > 0 && textsLookLikeCasualSocial(texts);
  const perilInTexts = texts.length > 0 && hasExplicitPerilInTexts(texts);
  const curTension = ctx.currentTension ?? 0;
  let next = { ...patch };

  if (next.mood?.trim() && isPerilMoodLabel(next.mood) && !perilInTexts) {
    const { mood: _m, ...rest } = next;
    next = rest;
  }

  if (next.tension != null) {
    const t = clampTension(next.tension);
    if (casual && t <= -50) {
      const { tension: _t, ...rest } = next;
      next = rest;
    } else if (casual && t < curTension - SCENE_TENSION_STICKY_MAX_DELTA) {
      next = { ...next, tension: clampTension(curTension - SCENE_TENSION_STICKY_MAX_DELTA) };
    }
  }

  return next;
}

function stickyClampTension(
  proposed: number,
  current: number,
  explicitScene: boolean,
  perilInPatch: boolean
): number {
  if (explicitScene) return clampTension(proposed);
  const delta = proposed - current;
  const maxStep = perilInPatch ? SCENE_TENSION_DELTA_THRESHOLD * 2 : SCENE_TENSION_STICKY_MAX_DELTA;
  if (Math.abs(delta) <= maxStep) return clampTension(proposed);
  return clampTension(current + Math.sign(delta) * maxStep);
}

/**
 * Fusionne un patch avec la scène archivée. Retourne null si aucun changement réel
 * (lieu inchangé, ambiance inchangée, tension delta < seuil).
 */
export function mergeScenePatch(
  current: ExtractedScene | null,
  patch: ScenePatchInput,
  options?: { explicitScene?: boolean }
): ExtractedScene | null {
  if (patch.unchanged) return null;

  const curLoc = current?.location?.trim() ?? "";
  const curMood = current?.mood?.trim() ?? "";
  const curTension = current?.tension ?? 0;
  const hasArchive = Boolean(current?.location?.trim() || current?.mood?.trim());

  const proposedLoc = (patch.location ?? curLoc).trim();
  let proposedMood = (patch.mood ?? curMood).trim();
  let proposedTension =
    patch.tension != null ? clampTension(patch.tension) : curTension;

  if (patch.tension != null) {
    const perilInPatch =
      hasExplicitPerilInTexts([proposedMood]) ||
      proposedTension <= SCENE_TENSION_PERIL_THRESHOLD;
    proposedTension = stickyClampTension(
      proposedTension,
      curTension,
      options?.explicitScene === true,
      perilInPatch
    );
  }

  if (
    proposedMood &&
    isPerilMoodLabel(proposedMood) &&
    proposedTension > SCENE_TENSION_PERIL_THRESHOLD &&
    !options?.explicitScene
  ) {
    proposedMood = tensionToDefaultMoodLabel(proposedTension);
  }

  if (!hasArchive) {
    if (!proposedLoc && !proposedMood && patch.tension == null) return null;
    if (!proposedLoc) return null;
    return {
      location: proposedLoc,
      mood: proposedMood || "—",
      tension: proposedTension,
    };
  }

  const locChanged =
    patch.location != null && proposedLoc.length > 0 && !locationsEquivalent(proposedLoc, curLoc);

  const moodChanged =
    patch.mood != null &&
    proposedMood.length > 0 &&
    proposedMood.toLowerCase() !== curMood.toLowerCase();

  const tensionDelta = Math.abs(proposedTension - curTension);
  const tensionChanged =
    patch.tension != null && tensionDelta >= SCENE_TENSION_DELTA_THRESHOLD;

  if (!locChanged && !moodChanged && !tensionChanged) return null;

  return {
    location: locChanged ? proposedLoc : curLoc,
    mood: moodChanged ? proposedMood : curMood,
    tension: tensionChanged ? proposedTension : curTension,
  };
}

export interface SceneExtractContext {
  location: string;
  mood: string;
  tension: number;
}

export function buildSceneExtractMessages(
  mjText: string,
  current?: SceneExtractContext | null
): { role: "system" | "user"; content: string }[] {
  const archiveBlock = current
    ? `Scène actuellement archivée pour la table :
- Lieu : ${current.location || "—"}
- Ambiance : ${current.mood || "—"}
- Tension : ${current.tension}

`
    : "";

  return [
    {
      role: "system",
      content: `Tu es l'archiviste d'une campagne JDR médiéval-fantastique.
À partir du dernier récit du MJ, déduis si l'état de la scène **a changé** par rapport à l'archive.

${archiveBlock}Réponds UNIQUEMENT avec un objet JSON valide.

Si le récit se poursuit au **même lieu**, avec la **même ambiance** globale et **aucun** basculement net de danger / détente (combat, piège, révélation choc, victoire, repos explicite) :
{"unchanged": true}

Sinon :
{
  "location": "Nom du lieu (court, français) — seulement si déplacement ou nouveau cadre spatial",
  "mood": "Ambiance 3–8 mots — seulement si le lieu change ou l'atmosphère bascule clairement",
  "tension": entier -100 à 100 — seulement si l'événement narratif le justifie (combat, menace, révélation, détente marquée)
}

Échelle tension :
- -100 à -40 : danger, piège, combat, menace immédiate (uniquement si le texte le justifie)
- -39 à 20 : tendu, incertain, négociation difficile
- 21 à 60 : neutre ou intrigant
- 61 à 100 : détente, victoire, découverte positive, fête

Ambiance (\`mood\`) :
- N'utilise **pas** « danger imminent » sans combat, menace explicite ou piège dans le récit analysé.
- Conversation en taverne / auberge / banter social **sans attaque** → tension modérée (environ 15 à 45) et ambiance du type « convivialité », « tension palpable » ou « calme relatif » — **pas** de pic périlleux.

Règles strictes :
- **Ne pas** renommer le lieu pour une reformulation (ex. « la taverne » vs « Taverne du Corbeau ») si c'est le même endroit → \`unchanged\` ou omettre \`location\`.
- **Ne pas** ajuster la tension pour un échange mineur (dialogue, détail, réplique courte, plaisanterie entre PJ) — conserve l'archive ; réponds \`unchanged\`.
- Ne invente pas un lieu absent du texte.
- **Jamais** un prénom ou nom de joueur/PNJ comme \`location\` (ex. « Thorin ») — uniquement un lieu/cadre spatial.
- En cas de doute sur un changement réel → \`{"unchanged": true}\`.`,
    },
    {
      role: "user",
      content: `Texte MJ à analyser :\n\n${mjText.slice(0, 6000)}`,
    },
  ];
}

export function parseExtractedScene(raw: string): ScenePatchInput | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as Record<string, unknown>;
    if (o.unchanged === true) return { unchanged: true };

    const location = String(o.location ?? "").trim();
    const mood = String(o.mood ?? "").trim();
    const hasTension = o.tension != null && o.tension !== "";
    if (!location && !mood && !hasTension) return null;

    const patch: ScenePatchInput = {};
    if (location) patch.location = location;
    if (mood) patch.mood = mood;
    if (hasTension) patch.tension = clampTension(Number(o.tension));
    return patch;
  } catch {
    return null;
  }
}

const MOOD_HINTS: [RegExp, string][] = [
  [/calme|paisible|serein|détendu|repos|tranquille/i, "calme relatif"],
  [/fête|rires|festif|convivial|taverne animée|bière|chopes/i, "convivialité bruyante"],
  [/tendu|inquiet|suspens|menaçant|murmur|chuchot/i, "tension palpable"],
  [/sombre|inquiétant|mélancolique|funèbre/i, "ambiance sombre"],
  [
    /\b(combat|attaque|piège|menace immédiate|mort imminente|péril mortel|embush|embuscade)\b/i,
    "danger imminent",
  ],
];

/** Extrait un nom de lieu depuis un extrait de récit (sans seuil de longueur). */
export function extractPlaceLocationFromText(text: string): string | null {
  const sample = text.slice(0, 6000).trim();
  if (sample.length < 8) return null;

  let location = "";

  const explicit = new RegExp(
    `(?:dans|aux|sur|sous|devant|derrière|au seuil de|au cœur des?|au milieu des?|à l'intérieur de|à l'intérieur d')\\s+(?:les?\\s+|la\\s+|l'|un\\s+|une\\s+)?(${PLACE_TYPE_CAPTURE}(?:\\s+(?:de|du|d'|des)\\s+[\\w''\\-]+)?)`,
    "i"
  );
  const explicitMatch = sample.match(explicit);
  if (explicitMatch?.[1]) location = explicitMatch[1].trim().slice(0, 80);

  if (!location) {
    const articlePlace = new RegExp(
      `\\b(?:la|le|l'|les|une|un)\\s+(${PLACE_TYPE_CAPTURE}(?:\\s+(?:de|du|d'|des)\\s+[\\w''\\-]+)?)`,
      "i"
    );
    const ap = sample.match(articlePlace);
    if (ap?.[1]) location = ap[1].trim().slice(0, 80);
  }

  if (!location) {
    const named = sample.match(
      new RegExp(
        `\\b((${PLACE_TYPE_CAPTURE})[\\w\\s''\\-]{0,40}|(?:ancien|vieux|vieille)\\s+[\\w''\\-]{3,30})`,
        "i"
      )
    );
    if (named?.[1]) location = named[1].trim().slice(0, 80);
  }

  if (!location || !isLikelyPlaceLocation(location)) return null;
  return location;
}

/** Parcourt des textes (ordre fourni par l'appelant) et retourne le premier lieu plausible. */
export function findSceneLocationInTexts(
  texts: string[],
  blockedNames: string[] = []
): ScenePatchInput | null {
  for (const text of texts) {
    const location = extractPlaceLocationFromText(text);
    if (!location) continue;
    const patch = scrubScenePatchLocation({ location }, blockedNames);
    if (patch.location) return patch;
  }
  return null;
}

/** Fallback léger si l'extraction LLM échoue mais le récit signale un lieu. */
export function heuristicSceneFromMjText(
  text: string,
  current?: SceneExtractContext | null
): ScenePatchInput | null {
  const sample = text.slice(0, 4000).trim();
  if (sample.length < 40) return null;

  const location = extractPlaceLocationFromText(sample);
  if (!location) return null;

  if (current?.location?.trim() && locationsEquivalent(location, current.location)) {
    return null;
  }

  let mood = "—";
  for (const [re, label] of MOOD_HINTS) {
    if (re.test(sample)) {
      mood = label;
      break;
    }
  }

  let tension: number | undefined;
  if (PERIL_NARRATIVE_RE.test(sample)) tension = -55;
  else if (/tendu|inquiet|suspens|menaçant/i.test(sample)) tension = -20;
  else if (/fête|repos|victoire|calme|serein|paix|convivial|taverne/i.test(sample)) tension = 35;
  else if (PLACE_TYPE_WORD.test(sample)) tension = 25;

  const patch: ScenePatchInput = { location, mood };
  if (tension != null) patch.tension = clampTension(tension);
  return patch;
}

/** Infère ambiance + tension depuis des extraits MJ/PJ (bootstrap, sans LLM). */
export function inferSceneMoodFromTexts(
  texts: string[],
  current?: SceneExtractContext | null
): Pick<ScenePatchInput, "mood" | "tension"> | null {
  const sample = texts.join("\n").slice(-12000).trim();
  if (sample.length < 20) return null;

  const casual = textsLookLikeCasualSocial(texts);
  const peril = hasExplicitPerilInTexts(texts);

  let mood = current?.mood?.trim() || "";
  for (const [re, label] of MOOD_HINTS) {
    if (re.test(sample)) {
      mood = label;
      break;
    }
  }
  if (!mood) mood = casual ? "calme relatif" : "tension palpable";

  if (isPerilMoodLabel(mood) && !peril) {
    mood = casual ? "calme relatif" : tensionToDefaultMoodLabel(current?.tension ?? 20);
  }

  let tension: number;
  if (peril) tension = -50;
  else if (casual) tension = current?.tension != null ? Math.max(current.tension, 25) : 30;
  else if (/tendu|inquiet|suspens/i.test(sample)) tension = -15;
  else tension = current?.tension ?? 15;

  return { mood, tension: clampTension(tension) };
}

/** Libellé lieu pour l'UI : affiche le lieu archivé s'il est plausible, sinon « Lieu inconnu ». */
export function getSceneLocationDisplayLabel(
  scene: { location?: string; mood?: string } | null | undefined
): string {
  const loc = scene?.location?.trim() ?? "";
  const mood = scene?.mood?.trim() ?? "";
  if (!loc && !mood) return "Scène non établie";
  if (!loc) return "Lieu inconnu";
  if (isLikelyPlaceLocation(loc)) return loc;
  return "Lieu inconnu";
}

export function hasEstablishedSceneLocation(
  scene: { location?: string } | null | undefined
): boolean {
  const loc = scene?.location?.trim() ?? "";
  return loc.length > 0 && isLikelyPlaceLocation(loc);
}
