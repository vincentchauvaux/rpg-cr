export type { AlignmentId } from "./alignment.js";
export type { SceneState, SceneLogEntry, TensionLevel } from "./scene.js";

export type PlayerRole = "admin" | "player";

/** Humain à la table ou personnage incarné par le MJ */
export type PlayerKind = "human" | "ai_puppet";

/** Présence dans le cercle narratif (PNJ / marionnettes IA) */
export type CircleStatus = "active" | "pending" | "withdrawn";

export type CharacterStatus = "draft" | "creating" | "ready";

/** Présence en salon — calculée côté serveur (WS + fiche perso) */
export type PresenceStatus = "arriving" | "active" | "leaving" | "offline";

/** Caractéristiques numériques (1–20) */
export interface CharacterStats {
  force?: number;
  dexterite?: number;
  constitution?: number;
  intelligence?: number;
  sagesse?: number;
  charisme?: number;
}

export interface CharacterSpell {
  name: string;
  description: string;
  uses?: string;
}

export interface CharacterAttack {
  name: string;
  description: string;
  damage?: string;
  range?: string;
}

export interface CharacterAction {
  name: string;
  description: string;
  type: "combat" | "social" | "exploration" | "other";
}

export interface CharacterUsableItem {
  name: string;
  description: string;
  quantity?: string;
  /** Référence textuelle à une ligne d'inventaire */
  fromInventory?: string;
}

/** Progression d'une compétence (niveau + barre 0–100 %). */
export interface SkillProgress {
  level: number;
  /** Avancement vers le niveau suivant (0–100). */
  progress: number;
  /** Compétence source ayant débloqué celle-ci (ex. lecture sur natation → crawl). */
  unlockedFrom?: string;
}

/** Fiche personnage + inventaire + capacités */
export interface CharacterSheet {
  /** Alignement moral (grille 3×3 D&D) */
  alignment?: import("./alignment.js").AlignmentId;
  rank?: string;
  background?: string;
  family?: string;
  secret?: string;
  ambition?: string;
  inventory?: string;
  equipment?: string;
  possessions?: string;
  habitat?: string;
  servants?: string;
  money?: string;
  mount?: string;
  notes?: string;
  stats?: CharacterStats;
  spells?: CharacterSpell[];
  attackTypes?: CharacterAttack[];
  actions?: CharacterAction[];
  usableItems?: CharacterUsableItem[];
  /** Compétences entraînables — clé = identifiant stable (ex. erudition, natation). */
  skills?: Record<string, SkillProgress>;
}

export const EMPTY_CHARACTER_SHEET: CharacterSheet = {};

export interface Player {
  id: string;
  roomId: string;
  name: string;
  role: PlayerRole;
  isGodMode: boolean;
  joinedAt: string;
  kind: PlayerKind;
  circleStatus: CircleStatus;
  displayColor: string | null;
  characterStatus: CharacterStatus;
  characterSheet: CharacterSheet;
  /** Fichier portrait sur disque — ex. `{playerId}.jpg` */
  avatarPath: string | null;
  /** Compte utilisateur lié (Google OAuth) — optionnel */
  userId?: string | null;
  /** Présence temps réel — enrichi à la diffusion WS, absent en SQLite */
  presenceStatus?: PresenceStatus;
  /** Langue d'affichage / traduction chat */
  preferredLocale: string;
  /** Histoire / identité verrouillée après finalisation wizard */
  storyLocked: boolean;
  /** Entrée narrative MJ déjà jouée (finalize / première intégration) */
  introducedInStory: boolean;
  /** Métadonnées campagne (karma, parcours) — optionnel en API */
  meta?: PlayerMeta;
}

/** Karma : entier (−10…+10) ; parcours et notes en texte libre */
export interface PlayerMeta {
  playerId: string;
  karma: number;
  parcours: string;
  notes: string;
}

/** Compte joueur persistant (Google OAuth). */
export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string;
}

/** Salon lié à un compte utilisateur (graines cross-appareil). */
export interface UserGrain {
  roomId: string;
  roomCode: string;
  roomName: string;
  playerId: string;
  playerName: string;
  role: PlayerRole;
  lastActivityAt: string | null;
}

export interface Npc {
  id: string;
  roomId: string;
  name: string;
  description: string;
  relations: string;
  createdAt: string;
}

export interface CampaignSummary {
  room: Room;
  lastActivityAt: string | null;
  messageCount: number;
  hasMarkdownExport: boolean;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  mapSeed: string;
  /** Graine narrative unique (monde / ouverture), distincte de l'affichage carte */
  worldSeed?: string;
  /** Ouverture de campagne MJ déjà jouée une fois */
  campaignOpeningDone?: boolean;
  /** Dernier préambule hôte (ISO) */
  lastPreambleAt?: string | null;
  /** Dernier récap de reprise hôte (ISO) */
  lastRecapAt?: string | null;
  llmConfig: LlmRoomConfig | null;
  /** État de scène courant (lieu, ambiance, tension) */
  scene?: import("./scene.js").SceneState | null;
}

export interface LlmRoomConfig {
  providerId: string;
  modelId: string;
  /**
   * Modèle optionnel pour les tâches outils (extraction JSON, traduction).
   * Absent = sibling catalogue (cloud) ou même id que `modelId` (local).
   */
  toolModelId?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  systemPromptOverride?: string;
  useFallbackLmStudio: boolean;
  /** Extraction auto des faits canon après chaque réponse MJ (défaut true) */
  autoExtractFacts?: boolean;
}

/** Fait narratif établi par le MJ — devient canon */
export type NarrativeFactType =
  | "spell_granted"
  | "item_found"
  | "stat_change"
  | "rule_established"
  | "ability_unlocked"
  | "other";

export interface NarrativeFact {
  id: string;
  roomId: string;
  sourceMessageId: string | null;
  factType: NarrativeFactType;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  content: string;
  /** `say` = parole ; `chat` conservé pour rétrocompatibilité */
  kind: "say" | "chat" | "action" | "system" | "mj";
  /** Langue du contenu original (`und` si inconnue) */
  sourceLocale?: string;
  createdAt: string;
}

export interface Quest {
  id: string;
  roomId: string;
  title: string;
  description: string;
  status: "active" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  roomId: string;
  title: string;
  body: string;
  sessionDay?: number;
  createdAt: string;
}

export interface ArchivedProposal {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  content: string;
  archivedAt: string;
}

export interface MapPointOfInterest {
  id: string;
  type:
    | "city"
    | "village"
    | "church"
    | "dungeon"
    | "unknown"
    | "capital";
  name: string;
  x: number;
  y: number;
  ruler?: string;
  country?: string;
}

export interface MapTerritory {
  id: string;
  name: string;
  country: string;
  bounds: { x: number; y: number; w: number; h: number };
}

export interface ProceduralMap {
  seed: string;
  width: number;
  height: number;
  cellSize: number;
  svg: string;
  biomes: string[][];
  heightmap: number[][];
  effects: ("toxic" | "fog" | "evil" | "buff")[][];
  territories: MapTerritory[];
  pois: MapPointOfInterest[];
  countries: string[];
}

/** Rôle recommandé d'un modèle dans le catalogue (MJ vs extraction / traduction). */
export type LlmModelRole = "narration" | "tool" | "both";

export interface LlmCatalogModel {
  id: string;
  label: string;
  contextWindow?: number;
  /** Défaut `both` si omis. */
  role?: LlmModelRole;
}

export interface LlmCatalogEntry {
  id: string;
  vendor: string;
  name: string;
  models: LlmCatalogModel[];
  openAiCompatible: boolean;
  defaultBaseUrl?: string;
  characteristics: string[];
  requiresApiKey: boolean;
}
