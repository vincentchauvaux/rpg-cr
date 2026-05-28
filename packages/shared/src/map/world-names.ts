/** Anciens noms figés (cartes / prompts legacy) — à ne pas réutiliser sur une nouvelle graine. */
export const LEGACY_DEFAULT_WORLD_NAMES = [
  "Royaume d'Aldermar",
  "Confédération des Brumes",
  "Dominion de Khar-Vos",
  "Îles Oubliées",
  "Marches du Nord",
] as const;

export function legacyWorldNamesGuard(locale = "fr"): string {
  const list = LEGACY_DEFAULT_WORLD_NAMES.join(", ");
  if (locale === "fr") {
    return `Ne pas utiliser ces noms de royaumes par défaut d'autres campagnes (${list}) sauf s'ils figurent déjà dans la carte ou la graine de **ce** salon.`;
  }
  return `Do not reuse default realm names from other campaigns (${list}) unless they already appear in this room's map or seed.`;
}

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    h += h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}

const NAME_STEMS = [
  "Vald",
  "Kor",
  "Thal",
  "Myr",
  "Ald",
  "Vos",
  "Nareth",
  "Grym",
  "Syl",
  "Drak",
  "Orin",
  "Hel",
  "Bran",
  "Keth",
  "Ulmar",
  "Irien",
  "Fen",
  "Zar",
] as const;

const NAME_ENDS = [
  "mar",
  "en",
  "os",
  "is",
  "eth",
  "an",
  "or",
  "ul",
  "ax",
  "ir",
  "ëa",
  "oth",
  "une",
  "gard",
  "mont",
] as const;

const EPITHETS = [
  "Sang-d'Or",
  "Cieux Clairs",
  "Trois Fleuves",
  "Cendres Vertes",
  "Lances d'Argent",
  "Sables Profonds",
  "Racines Anciennes",
  "Murmures",
  "Échos Lointains",
  "Braises",
  "Givre",
  "Serments",
] as const;

const GOVERNMENT_FORMS: ((core: string) => string)[] = [
  (c) => `Royaume de ${c}`,
  (c) => `Royaume d'${c}`,
  (c) => `Dominion de ${c}`,
  (c) => `Confédération des ${c}`,
  (c) => `Marche du ${c}`,
  (c) => `République de ${c}`,
  (c) => `Îles de ${c}`,
  (c) => `Union des ${c}`,
  (c) => `Thalassocratie de ${c}`,
];

function coreName(rnd: () => number): string {
  const stem = pick(NAME_STEMS, rnd);
  const end = pick(NAME_ENDS, rnd);
  if (rnd() < 0.35) return `${stem}${end}`;
  if (rnd() < 0.5) return `${pick(EPITHETS, rnd)}`;
  return `${stem}${end}-${pick(["val", "gar", "mont", "feld"], rnd)}`;
}

function uniqueCountryName(rnd: () => number, used: Set<string>): string {
  for (let t = 0; t < 48; t++) {
    const form = pick(GOVERNMENT_FORMS, rnd);
    const name = form(coreName(rnd));
    const legacy = LEGACY_DEFAULT_WORLD_NAMES.some(
      (l) => l.toLowerCase() === name.toLowerCase()
    );
    if (!legacy && !used.has(name.toLowerCase())) {
      used.add(name.toLowerCase());
      return name;
    }
  }
  const fallback = `Royaume de ${coreName(rnd)}-${Math.floor(rnd() * 900 + 100)}`;
  used.add(fallback.toLowerCase());
  return fallback;
}

/** 3–4 royaumes / factions uniques, déterministes pour une même graine. */
export function generateProceduralCountryNames(seed: string, count = 4): string[] {
  const rnd = seededRandom(`${seed}:countries`);
  const n = Math.min(Math.max(count, 3), 5);
  const used = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(uniqueCountryName(rnd, used));
  return out;
}

const RULER_TITLES = [
  "Reine",
  "Roi",
  "Duc",
  "Duchesse",
  "Archonte",
  "Magistrat",
  "Grand-prêtre",
  "Amiral",
] as const;

const RULER_NAMES = [
  "Elara",
  "Thorne",
  "Mirel",
  "Kaelis",
  "Ysara",
  "Borin",
  "Sera",
  "Varn",
  "Otho",
  "Lirien",
] as const;

export function generateProceduralRulerName(seed: string, index: number): string {
  const rnd = seededRandom(`${seed}:ruler:${index}`);
  if (rnd() < 0.12) return "Conseil des Sept";
  if (rnd() < 0.08) return "L'Ombral";
  return `${pick(RULER_TITLES, rnd)} ${pick(RULER_NAMES, rnd)}`;
}

const REGION_QUALIFIERS = [
  "Hautes Terres",
  "Basses Marches",
  "Côte Orientale",
  "Bassin Intérieur",
  "Confins",
  "Domaine Central",
  "Lisière",
  "Vallée Profonde",
] as const;

export function generateProceduralTerritoryName(
  seed: string,
  country: string,
  index: number
): string {
  const rnd = seededRandom(`${seed}:territory:${index}`);
  const short =
    country.replace(/^(Royaume|Dominion|Confédération|Marche|République|Îles|Union|Thalassocratie)\s+(d'|de |des |du )/i, "").trim() ||
    country;
  return `${pick(REGION_QUALIFIERS, rnd)} de ${short}`;
}

const DUNGEON_EPITHETS = [
  "Ombres",
  "Cendres",
  "Échos",
  "Serments",
  "Givre",
  "Cendres Vertes",
  "Lances",
] as const;

export function generateProceduralDungeonName(seed: string, index: number): string {
  const rnd = seededRandom(`${seed}:dungeon:${index}`);
  return `Donjon des ${pick(DUNGEON_EPITHETS, rnd)}`;
}
