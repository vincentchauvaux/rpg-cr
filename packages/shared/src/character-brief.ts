import type { CharacterSheet } from "./types.js";

export const BRIEF_STATIONS = [
  "noble",
  "peasant",
  "artisan",
  "beggar",
  "guard",
  "mercenary",
  "wizard",
  "priest",
  "rogue",
  "ranger",
  "sailor",
] as const;

export const BRIEF_ACTIVITIES = [
  "inn",
  "patrol",
  "road",
  "market",
  "post",
  "trouble",
  "looking_work",
] as const;

export const BRIEF_PASTS = [
  "finished_job",
  "new_in_town",
  "local",
  "serves",
  "left_quietly",
  "with_men",
  "alone",
] as const;

export type BriefStation = (typeof BRIEF_STATIONS)[number];
export type BriefActivity = (typeof BRIEF_ACTIVITIES)[number];
export type BriefPast = (typeof BRIEF_PASTS)[number];

export interface CharacterCreationBrief {
  station: BriefStation;
  activity: BriefActivity;
  past: BriefPast;
}

export const BRIEF_STATION_OPTIONS: { id: BriefStation; label: string; hint: string }[] = [
  { id: "noble", label: "Noble / chevalier", hint: "Petite maison, pas un roi" },
  { id: "peasant", label: "Paysan / villageois", hint: "Champs, corvées, village" },
  { id: "artisan", label: "Artisan / marchand", hint: "Échoppe, atelier, foire" },
  { id: "beggar", label: "Clochard / sans-le-sou", hint: "Rue, faim, débrouillardise" },
  { id: "guard", label: "Garde / milicien", hint: "Caserne, ronde, consigne" },
  { id: "mercenary", label: "Mercenaire", hint: "Contrat, paye, route" },
  { id: "wizard", label: "Magicien / érudit", hint: "Étude, grimoire, curiosité" },
  { id: "priest", label: "Prêtre / acolyte", hint: "Temple, rites, service" },
  { id: "rogue", label: "Voleur / rôdeur", hint: "Ruelle, larcins, ombre" },
  { id: "ranger", label: "Chasseur / forestier", hint: "Bois, pistes, gibier" },
  { id: "sailor", label: "Marin / batelier", hint: "Quai, fleuve, cargaison" },
];

export const BRIEF_ACTIVITY_OPTIONS: { id: BriefActivity; label: string }[] = [
  { id: "inn", label: "À l'auberge ou à la taverne" },
  { id: "patrol", label: "En patrouille ou en faction" },
  { id: "road", label: "Sur la route, entre deux villes" },
  { id: "market", label: "Au marché" },
  { id: "post", label: "À mon poste (caserne, temple, atelier…)" },
  { id: "trouble", label: "Dans une mauvaise passe (dette, accusation)" },
  { id: "looking_work", label: "Je cherche du travail ou un toit" },
];

export const BRIEF_PAST_OPTIONS: { id: BriefPast; label: string }[] = [
  { id: "finished_job", label: "Je sors d'un contrat ou d'une corvée" },
  { id: "new_in_town", label: "Je viens d'arriver ici" },
  { id: "local", label: "Je vis ici depuis toujours" },
  { id: "serves", label: "Je sers un seigneur, une compagnie ou un temple" },
  { id: "left_quietly", label: "J'ai dû partir — raison simple, pas un destin" },
  { id: "with_men", label: "Je voyage avec mes hommes" },
  { id: "alone", label: "Je suis seul" },
];

const STATION_SET = new Set<string>(BRIEF_STATIONS);
const ACTIVITY_SET = new Set<string>(BRIEF_ACTIVITIES);
const PAST_SET = new Set<string>(BRIEF_PASTS);

export function normalizeCreationBrief(
  raw: unknown
): CharacterCreationBrief | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const station = String(o.station ?? "");
  const activity = String(o.activity ?? "");
  const past = String(o.past ?? "");
  if (!STATION_SET.has(station) || !ACTIVITY_SET.has(activity) || !PAST_SET.has(past)) {
    return undefined;
  }
  return {
    station: station as BriefStation,
    activity: activity as BriefActivity,
    past: past as BriefPast,
  };
}

export function isCharacterCreationBriefComplete(
  brief?: CharacterCreationBrief | null
): brief is CharacterCreationBrief {
  return Boolean(normalizeCreationBrief(brief));
}

function optionLabel<T extends string>(
  options: { id: T; label: string }[],
  id: T
): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

const STATION_RANK: Record<BriefStation, string> = {
  noble: "Chevalier de petite maison",
  peasant: "Villageois",
  artisan: "Artisan",
  beggar: "Vagabond",
  guard: "Garde",
  mercenary: "Mercenaire",
  wizard: "Apprenti mage",
  priest: "Acolyte",
  rogue: "Voleur",
  ranger: "Pisteur",
  sailor: "Batelier",
};

const ACTIVITY_HABITAT: Record<BriefActivity, string> = {
  inn: "Chambre d'auberge",
  patrol: "Caserne / ronde",
  road: "Camp de route",
  market: "Étal / place du marché",
  post: "Poste de service",
  trouble: "Un toit précaire",
  looking_work: "Pas de logement fixe",
};

function fillIfEmpty(current: string | undefined, next: string): string {
  return current?.trim() ? current : next;
}

export function applyCreationBriefToSheet(
  sheet: CharacterSheet,
  brief: CharacterCreationBrief
): CharacterSheet {
  const stationLabel = optionLabel(BRIEF_STATION_OPTIONS, brief.station);
  const activityLabel = optionLabel(BRIEF_ACTIVITY_OPTIONS, brief.activity);
  const pastLabel = optionLabel(BRIEF_PAST_OPTIONS, brief.past);

  const background =
    `Tu es ${stationLabel.toLowerCase()}. ${activityLabel}. ${pastLabel}. ` +
    `Rien de plus pour l'instant — pas de secret dynastique ni de quête cachée tant que tu ne l'as pas écrit.`;

  const withMen = brief.past === "with_men" || brief.station === "guard" || brief.station === "noble";
  const servants =
    brief.past === "alone"
      ? ""
      : withMen
        ? "Quelques hommes sous tes ordres (pas de nom propre tant que tu ne les as pas nommés)."
        : "";

  const habitatDefault =
    brief.past === "local" && (brief.station === "peasant" || brief.station === "artisan")
      ? "Maison au village"
      : ACTIVITY_HABITAT[brief.activity];

  return {
    ...sheet,
    creationBrief: brief,
    rank: fillIfEmpty(sheet.rank, STATION_RANK[brief.station]),
    habitat: fillIfEmpty(sheet.habitat, habitatDefault),
    background: fillIfEmpty(sheet.background, background),
    servants: fillIfEmpty(sheet.servants, servants),
    ambition: fillIfEmpty(
      sheet.ambition,
      brief.activity === "looking_work"
        ? "Trouver un contrat ou un toit pour la nuit."
        : brief.activity === "trouble"
          ? "Te sortir de ce mauvais pas sans faire de vagues."
          : "Tenir ta place et voir venir."
    ),
  };
}

export function formatCreationBriefForMj(brief?: CharacterCreationBrief | null): string {
  const b = normalizeCreationBrief(brief);
  if (!b) return "";
  return [
    "### Brief de départ (choix du joueur — canon)",
    `- Qui : ${optionLabel(BRIEF_STATION_OPTIONS, b.station)}`,
    `- En ce moment : ${optionLabel(BRIEF_ACTIVITY_OPTIONS, b.activity)}`,
    ...(b.activity === "inn"
      ? [
          "- Tu es **client** ce soir (table, chope) : tu ne travailles pas à l'auberge, tu n'es pas en cuisine.",
        ]
      : []),
    `- Histoire récente : ${optionLabel(BRIEF_PAST_OPTIONS, b.past)}`,
    "- N'invente **pas** de père secret, de prophétie ni de PNJ nommé hors fiche.",
    `- L'ouverture se passe **là où le joueur a dit être** (${optionLabel(BRIEF_ACTIVITY_OPTIONS, b.activity)}). Un seul lieu.`,
    "- D'abord tu/vous + le lieu + ce qu'il fait ; ensuite un incident de CE lieu. Interdit : le vieux + étranger + sac.",
    "- Incident **personnel** (ça le concerne). Interdit : inconnu + parchemin crypté + disparition.",
  ].join("\n");
}

export function formatCreationBriefAsHints(brief?: CharacterCreationBrief | null): string {
  const b = normalizeCreationBrief(brief);
  if (!b) return "";
  return [
    `Identité : ${optionLabel(BRIEF_STATION_OPTIONS, b.station)}.`,
    `Situation actuelle : ${optionLabel(BRIEF_ACTIVITY_OPTIONS, b.activity)}.`,
    `Passé récent : ${optionLabel(BRIEF_PAST_OPTIONS, b.past)}.`,
    "Reste terre-à-terre. N'invente pas un secret sur le père, une destinée ou un compagnon nommé (Sir, Dame…).",
    "Le champ secret peut rester simple ou vide.",
  ].join("\n");
}
