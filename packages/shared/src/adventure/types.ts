/** Schéma d'aventure RPG-CR — une partie = un JSON, le MJ n'en lit qu'une tranche. */

export const ADVENTURE_SCHEMA = "rpg-cr.adventure.v1" as const;

/** Visibilité : `hidden` / `sheet` ne partent jamais dans le prompt MJ tant que non déverrouillés. */
export type AdventureReveal = "public" | "established" | "hidden" | "sheet";

export type AdventureEventKind =
  | "opening"
  | "say"
  | "action"
  | "inspect"
  | "travel"
  | "enter"
  | "leave"
  | "combat"
  | "social"
  | "rest"
  | "ritual"
  | "use_item"
  | "scene_check"
  | "recap";

export type AdventureNodeKind =
  | "haven"
  | "street"
  | "threshold"
  | "wilderness"
  | "dungeon"
  | "court"
  | "temple"
  | "workshop"
  | "road"
  | "water"
  | "combat"
  | "camp"
  | "home"
  | "other";

export type AdventureCastKind =
  | "extra"
  | "named"
  | "creature"
  | "patron"
  | "faction-face"
  | "spirit";

export type AdventureFactKind =
  | "beat"
  | "object"
  | "relation"
  | "rumour"
  | "debt"
  | "law"
  | "omen"
  | "wound";

export type AdventureClockKind =
  | "danger"
  | "quest"
  | "faction"
  | "curse"
  | "travel"
  | "weather"
  | "hunt";

export interface AdventureNow {
  nodeId: string;
  placeId?: string;
  timeOfDay?: string;
  weather?: string;
  tension?: number;
  lastBeat?: string;
  /** Ids de faits déjà joués à la table. */
  establishedFactIds?: string[];
  /** Secrets déverrouillés (fiche, révélation jouée). */
  unlockedSecretIds?: string[];
}

export interface AdventurePlace {
  id: string;
  name: string;
  kind?: AdventureNodeKind;
  summary: string;
  tags?: string[];
  region?: string;
  biome?: string;
  hazard?: string;
  reveal?: AdventureReveal;
}

export interface AdventureExit {
  nodeId: string;
  label: string;
  effort?: "step" | "walk" | "travel" | "climb" | "sail";
}

export interface AdventureHook {
  id: string;
  text: string;
  tags?: string[];
  spent?: boolean;
}

export interface AdventureNode {
  id: string;
  placeId: string;
  kind: AdventureNodeKind;
  title: string;
  /** Pose jouable : 1–2 phrases, 2e personne. */
  youAre: string;
  tags?: string[];
  presentCastIds?: string[];
  props?: string[];
  hooks?: AdventureHook[];
  exits?: AdventureExit[];
  skillHints?: string[];
  clockIds?: string[];
  /** Interdits locaux (ex. « tu n'es pas le service »). */
  taboos?: string[];
}

export interface AdventureCastMember {
  id: string;
  /** Libellé de table : « la tenancière », jamais un nom hors fiche. */
  label: string;
  kind: AdventureCastKind;
  named?: boolean;
  properName?: string;
  tags?: string[];
  reveal?: AdventureReveal;
  voice?: string;
  want?: string;
  homePlaceId?: string;
  onSheet?: boolean;
  secretId?: string;
}

export interface AdventureFact {
  id: string;
  kind: AdventureFactKind;
  text: string;
  tags?: string[];
  nodeIds?: string[];
  placeIds?: string[];
  reveal?: AdventureReveal;
}

export interface AdventureSecret {
  id: string;
  text: string;
  tags?: string[];
  /** Ne jamais envoyer au LLM tant que l'id n'est pas dans now.unlockedSecretIds. */
  locked: true;
}

export interface AdventureClock {
  id: string;
  label: string;
  kind: AdventureClockKind;
  ticks: number;
  max: number;
  tags?: string[];
  nodeIds?: string[];
}

export interface AdventureQuest {
  id: string;
  title: string;
  status: "latent" | "active" | "done" | "failed";
  summary: string;
  nodeIds?: string[];
  reveal?: AdventureReveal;
}

export interface AdventureItem {
  id: string;
  name: string;
  summary: string;
  tags?: string[];
  location?: "carried" | "here" | "elsewhere" | "unknown";
  reveal?: AdventureReveal;
  ownerCastId?: string;
}

export interface AdventureCreature {
  id: string;
  label: string;
  summary: string;
  tags?: string[];
  reveal?: AdventureReveal;
  threat?: "nuisance" | "even" | "deadly";
}

export interface AdventureFaction {
  id: string;
  name: string;
  summary: string;
  tags?: string[];
  reveal?: AdventureReveal;
}

export interface AdventureGod {
  id: string;
  name: string;
  domain: string;
  reveal?: AdventureReveal;
}

export interface AdventureMagicTradition {
  id: string;
  name: string;
  cost: string;
  taboo?: string;
  tags?: string[];
}

export interface AdventureTone {
  genre: string[];
  taboos: string[];
  scale: "intimate" | "local" | "realm" | "planar";
}

export interface AdventureCalendar {
  season?: string;
  festival?: string;
  dayName?: string;
}

/** Modules optionnels — absents du prompt sauf si l'événement les demande. */
export interface AdventureModules {
  cosmology?: { gods?: AdventureGod[]; planes?: string[] };
  magic?: { traditions?: AdventureMagicTradition[]; deadMagic?: boolean };
  law?: { authority?: string; crimes?: string[] };
  economy?: { currency?: string; note?: string };
  languages?: string[];
}

export interface Adventure {
  schema: typeof ADVENTURE_SCHEMA;
  id: string;
  title: string;
  premise: string;
  worldSeed: string;
  tone: AdventureTone;
  restrictions: string[];
  now: AdventureNow;
  places: Record<string, AdventurePlace>;
  nodes: Record<string, AdventureNode>;
  cast: Record<string, AdventureCastMember>;
  facts: AdventureFact[];
  secrets?: AdventureSecret[];
  clocks?: AdventureClock[];
  quests?: AdventureQuest[];
  items?: Record<string, AdventureItem>;
  creatures?: Record<string, AdventureCreature>;
  factions?: Record<string, AdventureFaction>;
  modules?: AdventureModules;
  calendar?: AdventureCalendar;
}

export interface AdventureEvent {
  kind: AdventureEventKind;
  text?: string;
  nodeId?: string;
  placeId?: string;
  /** Lieu scène / table — sert à viser un nœud sans bouger `now` (aperçu). */
  locationText?: string;
  tags?: string[];
  /** God / debug : inclure les secrets déverrouillés. */
  includeUnlockedSecrets?: boolean;
}

export interface AdventureSlice {
  schema: typeof ADVENTURE_SCHEMA;
  title: string;
  premise: string;
  tone: AdventureTone;
  restrictions: string[];
  now: AdventureNow;
  node: AdventureNode | null;
  place: AdventurePlace | null;
  exits: AdventureExit[];
  presentCast: AdventureCastMember[];
  facts: AdventureFact[];
  hooks: AdventureHook[];
  clocks: AdventureClock[];
  quests: AdventureQuest[];
  items: AdventureItem[];
  creatures: AdventureCreature[];
  factions: AdventureFaction[];
  modules: AdventureModules;
  calendar?: AdventureCalendar;
  secrets: AdventureSecret[];
}
