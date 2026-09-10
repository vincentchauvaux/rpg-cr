import type { CharacterSheet } from "../types.js";
import { buildGenerationLocaleRules, normalizeLocale } from "../locale.js";

/** Champs texte éligibles à la génération IA */
export type CharacterSheetFieldKey =
  | "rank"
  | "background"
  | "family"
  | "secret"
  | "ambition"
  | "personality"
  | "companionBond"
  | "companionAgenda"
  | "inventory"
  | "equipment"
  | "possessions"
  | "habitat"
  | "servants"
  | "money"
  | "mount"
  | "notes";

export const CHARACTER_SHEET_FIELD_KEYS: CharacterSheetFieldKey[] = [
  "rank",
  "background",
  "family",
  "secret",
  "ambition",
  "personality",
  "companionBond",
  "companionAgenda",
  "inventory",
  "equipment",
  "possessions",
  "habitat",
  "servants",
  "money",
  "mount",
  "notes",
];

export function isCharacterSheetFieldKey(
  value: string
): value is CharacterSheetFieldKey {
  return (CHARACTER_SHEET_FIELD_KEYS as string[]).includes(value);
}

const CHARACTER_FIELD_LABELS_FR: Record<CharacterSheetFieldKey, string> = {
  rank: "Rang / statut social",
  background: "Historique",
  family: "Famille & liens",
  secret: "Passé secret ou tragédie",
  ambition: "Ambition / intrigue",
  personality: "Caractère",
  companionBond: "Lien de route",
  companionAgenda: "Agenda parallèle",
  inventory: "Inventaire",
  equipment: "Équipement",
  possessions: "Possessions",
  habitat: "Habitat / demeure",
  servants: "Domestiques & compagnons",
  money: "Argent & ressources",
  mount: "Monture / transport",
  notes: "Notes libres",
};

const CHARACTER_FIELD_LABELS_EN: Record<CharacterSheetFieldKey, string> = {
  rank: "Rank / social status",
  background: "Background",
  family: "Family & ties",
  secret: "Secret past or tragedy",
  ambition: "Ambition / intrigue",
  personality: "Personality",
  companionBond: "Why they travel with the party",
  companionAgenda: "Private agenda",
  inventory: "Inventory",
  equipment: "Equipment",
  possessions: "Possessions",
  habitat: "Home / dwelling",
  servants: "Servants & companions",
  money: "Money & resources",
  mount: "Mount / transport",
  notes: "Free notes",
};

/** Libellés UI par défaut (français). */
export const CHARACTER_FIELD_LABELS = CHARACTER_FIELD_LABELS_FR;

export function getCharacterFieldLabels(
  locale?: string
): Record<CharacterSheetFieldKey, string> {
  return normalizeLocale(locale) === "en"
    ? CHARACTER_FIELD_LABELS_EN
    : CHARACTER_FIELD_LABELS_FR;
}

const FIELD_HINTS: Partial<Record<CharacterSheetFieldKey, string>> = {
  inventory: "Liste courte d'objets portés ou en sac (puces, virgules).",
  equipment: "Armures, armes, outils du métier — cohérents avec le rang.",
  money: "Montant approximatif, forme (pièces, lettres de crédit) et source.",
  mount: "Animal ou véhicule ; indiquer état et charge si pertinent.",
  servants: "Noms ou rôles de domestiques, compagnons, apprentis.",
  personality: "Un trait vivant (comique, sinistre, gourmand, mystérieux, vaniteux…), pas une liste.",
  companionBond: "Pourquoi iel voyage avec le groupe (dette, curiosité, amour, or…).",
  companionAgenda: "But parallèle ou secret — pas forcément avoué à table.",
};

/*
 * Few-shot (commentaire prompt engineering) :
 * background = « Riche marchand de soieries du Sud »
 * → inventory : « 3 ballots de soie, balance à peser, sceau de guilde, échantillons teintés »
 * → money : « Bourse garnie (~200 deniers), lettre de crédit d'un associé lyonnais »
 * → mount : « Âne bâté pour les échantillons ; charrette garée à l'auberge du port »
 */

function formatFilledFields(
  sheet: CharacterSheet,
  exclude: CharacterSheetFieldKey,
  labels: Record<CharacterSheetFieldKey, string>
): string {
  const lines: string[] = [];
  for (const key of CHARACTER_SHEET_FIELD_KEYS) {
    if (key === exclude) continue;
    const val = sheet[key]?.trim();
    if (val) lines.push(`- ${labels[key]} : ${val}`);
  }
  return lines.length ? lines.join("\n") : "(aucun champ rempli pour l'instant)";
}

export function buildCharacterFieldMessages(
  field: CharacterSheetFieldKey,
  currentSheet: CharacterSheet,
  playerName: string,
  worldContext?: string,
  preferredLocale?: string
): { role: "system" | "user"; content: string }[] {
  const labels = getCharacterFieldLabels(preferredLocale);
  const label = labels[field];
  const loc = normalizeLocale(preferredLocale);
  const hint =
    FIELD_HINTS[field] ??
    (loc === "en"
      ? "1–3 sentences or a short list."
      : "1 à 3 phrases ou liste courte.");

  const system = [
    "Tu es le Maître du Jeu qui aide à créer un personnage joueur (PJ) cohérent.",
    "Univers : médiéval-fantasy, ton sobre avec une touche d'humour discret.",
    "Règles strictes :",
    "- Réponds UNIQUEMENT avec le contenu du champ demandé, sans titre, sans JSON, sans markdown.",
    "- Reste cohérent avec les champs déjà remplis (rang, historique, famille, etc.).",
    "- Si l'historique implique une profession ou une fortune, déduis logiquement inventaire, argent, monture.",
    "- Pas de méta, pas d'explication sur ta démarche.",
    buildGenerationLocaleRules(preferredLocale),
  ].join("\n");

  const user = [
    worldContext?.trim() ? `Contexte monde / campagne :\n${worldContext.trim()}\n` : "",
    `Personnage : ${playerName}`,
    "Champs déjà définis sur la fiche :",
    formatFilledFields(currentSheet, field, labels),
    "",
    `Génère UNIQUEMENT le champ « ${label} ».`,
    hint,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Nettoie la réponse LLM (guillemets, préfixes, JSON accidentel) */
export function sanitizeCharacterFieldValue(
  raw: string,
  field: CharacterSheetFieldKey,
  preferredLocale?: string
): string {
  let v = raw.trim();
  if (!v) return v;

  const jsonMatch = v.match(/^\{[\s\S]*\}$/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(v) as Record<string, unknown>;
      const keyed = obj[field] ?? obj.value ?? obj.content;
      if (typeof keyed === "string") v = keyed.trim();
    } catch {
      /* garder brut */
    }
  }

  v = v.replace(/^["'`]+|["'`]+$/g, "");
  const label = getCharacterFieldLabels(preferredLocale)[field];
  v = v.replace(new RegExp(`^\\**${label}\\**\\s*:?\\s*`, "i"), "");
  const enLabel = CHARACTER_FIELD_LABELS_EN[field];
  if (enLabel !== label) {
    v = v.replace(new RegExp(`^\\**${enLabel}\\**\\s*:?\\s*`, "i"), "");
  }
  v = v.replace(/^#+\s*/gm, "");
  return v.trim().slice(0, 2000);
}
