import type {
  CharacterAction,
  CharacterAttack,
  CharacterSheet,
  CharacterSpell,
  CharacterStats,
  CharacterUsableItem,
} from "./types.js";
import { formatAlignmentLabel, normalizeAlignment } from "./alignment.js";
import { formatSkillsLine, normalizeSkills } from "./character-progression.js";
import {
  clampCompanionLoyalty,
  formatCompanionLoyaltyHint,
  normalizeCompanionStance,
} from "./companion-pact.js";

export const STAT_KEYS = [
  "force",
  "dexterite",
  "constitution",
  "intelligence",
  "sagesse",
  "charisme",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  force: "Force",
  dexterite: "Dextérité",
  constitution: "Constitution",
  intelligence: "Intelligence",
  sagesse: "Sagesse",
  charisme: "Charisme",
};

export type CharacterSheetSectionKey =
  | "stats"
  | "spells"
  | "attackTypes"
  | "actions"
  | "usableItems";

export const CHARACTER_SHEET_SECTION_KEYS: CharacterSheetSectionKey[] = [
  "stats",
  "spells",
  "attackTypes",
  "actions",
  "usableItems",
];

/** Champs texte — histoire / identité (verrouillés après finalisation). */
export const STORY_TEXT_FIELDS = [
  "rank",
  "background",
  "family",
  "secret",
  "ambition",
  "personality",
  "companionBond",
  "companionAgenda",
] as const;

export type StoryTextFieldKey = (typeof STORY_TEXT_FIELDS)[number];

/** Champs texte — biens matériels (modifiables en jeu). */
export const MATERIAL_TEXT_FIELDS = [
  "inventory",
  "equipment",
  "possessions",
  "habitat",
  "servants",
  "money",
  "mount",
  "notes",
] as const;

export type MaterialTextFieldKey = (typeof MATERIAL_TEXT_FIELDS)[number];

/** Sections structurées — histoire (stats, sorts, actions). */
export const STORY_SECTION_KEYS: CharacterSheetSectionKey[] = [
  "stats",
  "spells",
  "attackTypes",
  "actions",
];

/** Sections structurées — biens (objets utilisables). */
export const MATERIAL_SECTION_KEYS: CharacterSheetSectionKey[] = ["usableItems"];

export const STORY_LOCK_MESSAGE =
  "L'histoire de votre personnage est gravée dans la chronique — seuls biens et équipement restent modifiables.";

export function clampStat(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(20, Math.max(1, Math.round(value)));
}

export function normalizeStats(raw?: Partial<CharacterStats>): CharacterStats {
  const stats: CharacterStats = {};
  for (const key of STAT_KEYS) {
    const v = raw?.[key];
    if (v != null && v !== ("" as unknown)) stats[key] = clampStat(Number(v));
  }
  return stats;
}

function normalizeSpells(raw: unknown): CharacterSpell[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        name: String(o.name ?? "").trim(),
        description: String(o.description ?? "").trim(),
        uses: o.uses != null ? String(o.uses).trim() : undefined,
      };
    })
    .filter((x) => x.name);
}

function normalizeAttacks(raw: unknown): CharacterAttack[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        name: String(o.name ?? "").trim(),
        damage: o.damage != null ? String(o.damage).trim() : undefined,
        range: o.range != null ? String(o.range).trim() : undefined,
        description: String(o.description ?? "").trim(),
      };
    })
    .filter((x) => x.name);
}

function normalizeActions(raw: unknown): CharacterAction[] {
  if (!Array.isArray(raw)) return [];
  const types = new Set(["combat", "social", "exploration", "other"]);
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      const typeRaw = String(o.type ?? "other");
      return {
        name: String(o.name ?? "").trim(),
        description: String(o.description ?? "").trim(),
        type: (types.has(typeRaw) ? typeRaw : "other") as CharacterAction["type"],
      };
    })
    .filter((x) => x.name);
}

function normalizeUsableItems(raw: unknown): CharacterUsableItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        name: String(o.name ?? "").trim(),
        description: String(o.description ?? "").trim(),
        quantity: o.quantity != null ? String(o.quantity).trim() : undefined,
        fromInventory: o.fromInventory != null ? String(o.fromInventory).trim() : undefined,
      };
    })
    .filter((x) => x.name);
}

/** Normalise une fiche complète (texte + sections structurées). */
export function normalizeCharacterSheet(raw: Partial<CharacterSheet> = {}): CharacterSheet {
  const alignment = normalizeAlignment(raw.alignment);
  return {
    ...(alignment ? { alignment } : {}),
    rank: raw.rank?.trim() ?? "",
    background: raw.background?.trim() ?? "",
    family: raw.family?.trim() ?? "",
    secret: raw.secret?.trim() ?? "",
    ambition: raw.ambition?.trim() ?? "",
    inventory: raw.inventory?.trim() ?? "",
    equipment: raw.equipment?.trim() ?? "",
    possessions: raw.possessions?.trim() ?? "",
    habitat: raw.habitat?.trim() ?? "",
    servants: raw.servants?.trim() ?? "",
    money: raw.money?.trim() ?? "",
    mount: raw.mount?.trim() ?? "",
    notes: raw.notes?.trim() ?? "",
    personality: raw.personality?.trim() ?? "",
    companionBond: raw.companionBond?.trim() ?? "",
    companionAgenda: raw.companionAgenda?.trim() ?? "",
    ...(clampCompanionLoyalty(raw.companionLoyalty) != null
      ? { companionLoyalty: clampCompanionLoyalty(raw.companionLoyalty) }
      : {}),
    ...(normalizeCompanionStance(raw.companionStance)
      ? { companionStance: normalizeCompanionStance(raw.companionStance) }
      : {}),
    stats: normalizeStats(raw.stats),
    spells: normalizeSpells(raw.spells),
    attackTypes: normalizeAttacks(raw.attackTypes),
    actions: normalizeActions(raw.actions),
    usableItems: normalizeUsableItems(raw.usableItems),
    skills: normalizeSkills(raw.skills),
  };
}

export function characterSheetsEqual(a: CharacterSheet, b: CharacterSheet): boolean {
  return JSON.stringify(normalizeCharacterSheet(a)) === JSON.stringify(normalizeCharacterSheet(b));
}

export function sheetHasStructuredContent(sheet: CharacterSheet): boolean {
  const n = normalizeCharacterSheet(sheet);
  if (STAT_KEYS.some((k) => n.stats?.[k] != null)) return true;
  return (
    (n.spells?.length ?? 0) > 0 ||
    (n.attackTypes?.length ?? 0) > 0 ||
    (n.actions?.length ?? 0) > 0 ||
    (n.usableItems?.length ?? 0) > 0
  );
}

/** Fiche « remplie » pour masquer le bouton ✨ Tout remplir. */
/** Fiche suffisante pour intégration narrative MJ (identité, pas seulement biens). */
export function isCharacterSheetSubstantial(sheet: CharacterSheet): boolean {
  const s = normalizeCharacterSheet(sheet);
  return STORY_TEXT_FIELDS.some((key) => {
    const v = s[key];
    return typeof v === "string" && v.trim().length >= 3;
  });
}

export function isCharacterSheetFilled(sheet: CharacterSheet): boolean {
  const n = normalizeCharacterSheet(sheet);
  if (Boolean(n.rank?.trim()) && Boolean(n.background?.trim())) return true;
  if (sheetHasStructuredContent(n) && Boolean(n.rank?.trim())) return true;
  return false;
}

export function isStoryLocked(player: { storyLocked?: boolean }): boolean {
  return player.storyLocked === true;
}

export function isStoryTextField(key: string): key is StoryTextFieldKey {
  return (STORY_TEXT_FIELDS as readonly string[]).includes(key);
}

export function isMaterialTextField(key: string): key is MaterialTextFieldKey {
  return (MATERIAL_TEXT_FIELDS as readonly string[]).includes(key);
}

export function isStorySectionKey(key: string): key is CharacterSheetSectionKey {
  return (STORY_SECTION_KEYS as string[]).includes(key);
}

function structuredStoryEqual(a: CharacterSheet, b: CharacterSheet): boolean {
  return (
    JSON.stringify(a.stats ?? {}) === JSON.stringify(b.stats ?? {}) &&
    JSON.stringify(a.spells ?? []) === JSON.stringify(b.spells ?? []) &&
    JSON.stringify(a.attackTypes ?? []) === JSON.stringify(b.attackTypes ?? []) &&
    JSON.stringify(a.actions ?? []) === JSON.stringify(b.actions ?? [])
  );
}

/** true si des champs histoire diffèrent entre deux fiches normalisées. */
export function storyFieldsChanged(
  current: CharacterSheet,
  proposed: CharacterSheet
): boolean {
  const a = normalizeCharacterSheet(current);
  const b = normalizeCharacterSheet(proposed);
  if ((a.alignment ?? "") !== (b.alignment ?? "")) return true;
  for (const key of STORY_TEXT_FIELDS) {
    if ((a[key] ?? "") !== (b[key] ?? "")) return true;
  }
  return !structuredStoryEqual(a, b);
}

/** Extrait uniquement les champs matériels d'un patch. */
export function pickMaterialPatch(patch: Partial<CharacterSheet>): Partial<CharacterSheet> {
  const out: Partial<CharacterSheet> = {};
  for (const key of MATERIAL_TEXT_FIELDS) {
    if (patch[key] !== undefined) out[key] = patch[key];
  }
  if (patch.usableItems !== undefined) out.usableItems = patch.usableItems;
  if (patch.companionLoyalty !== undefined) out.companionLoyalty = patch.companionLoyalty;
  if (patch.companionStance !== undefined) out.companionStance = patch.companionStance;
  return out;
}

/** Fusionne en respectant le verrou histoire (patch matériel seulement). */
export function mergeSheetRespectingStoryLock(
  current: CharacterSheet,
  patch: Partial<CharacterSheet>,
  storyLocked: boolean
): CharacterSheet {
  if (!storyLocked) return mergeCharacterSheet(current, patch);
  return mergeCharacterSheet(current, pickMaterialPatch(patch));
}

export function formatStatsLine(stats?: CharacterStats): string {
  if (!stats) return "";
  return STAT_KEYS.filter((k) => stats[k] != null)
    .map((k) => `${STAT_LABELS[k].slice(0, 3).toUpperCase()} ${stats[k]}`)
    .join(" · ");
}

export function formatCharacterSheetForMj(name: string, sheet: CharacterSheet): string {
  const s = normalizeCharacterSheet(sheet);
  const lines: string[] = [`### Fiche — ${name}`];
  if (s.alignment) lines.push(`- Alignement : ${formatAlignmentLabel(s.alignment)}`);
  if (s.personality?.trim()) lines.push(`- Caractère : ${s.personality.trim()}`);
  if (s.companionBond?.trim()) lines.push(`- Lien de route : ${s.companionBond.trim()}`);
  if (s.companionAgenda?.trim()) {
    lines.push(`- Agenda (secret MJ) : ${s.companionAgenda.trim()}`);
  }
  if (s.companionLoyalty != null || s.companionStance) {
    lines.push(`- Loyauté compagnon : ${formatCompanionLoyaltyHint(s)}`);
  }
  if (s.rank) lines.push(`- Rang : ${s.rank} (canon — pas un titre inventé)`);
  if (s.background?.trim()) {
    lines.push(`- Histoire : ${s.background.trim().slice(0, 420)}`);
  }
  if (s.ambition?.trim()) lines.push(`- Ambition / but : ${s.ambition.trim().slice(0, 240)}`);
  if (s.servants?.trim()) {
    lines.push(
      `- Hommes / suite (présents avec ${name} sauf si le récit les a éloignés) : ${s.servants.trim()}`
    );
  }
  if (s.habitat?.trim()) lines.push(`- Habitat : ${s.habitat.trim().slice(0, 160)}`);
  const statLine = formatStatsLine(s.stats);
  if (statLine) lines.push(`- Caractéristiques : ${statLine}`);
  if (s.equipment?.trim()) lines.push(`- Équipement : ${s.equipment.trim()}`);
  if (s.inventory?.trim()) lines.push(`- Inventaire : ${s.inventory.trim()}`);
  if (s.spells?.length) {
    lines.push("- Sorts & pouvoirs :");
    for (const sp of s.spells) {
      lines.push(`  • ${sp.name}${sp.uses ? ` (${sp.uses})` : ""} — ${sp.description || "—"}`);
    }
  }
  if (s.attackTypes?.length) {
    lines.push("- Types d'attaque :");
    for (const a of s.attackTypes) {
      lines.push(
        `  • ${a.name}${a.damage ? ` [${a.damage}]` : ""}${a.range ? ` portée ${a.range}` : ""} — ${a.description || "—"}`
      );
    }
  }
  if (s.actions?.length) {
    lines.push("- Actions possibles :");
    for (const a of s.actions) {
      lines.push(`  • [${a.type}] ${a.name} — ${a.description || "—"}`);
    }
  }
  if (s.usableItems?.length) {
    lines.push("- Objets utilisables :");
    for (const u of s.usableItems) {
      lines.push(
        `  • ${u.name}${u.quantity ? ` ×${u.quantity}` : ""}${u.fromInventory ? ` (inventaire: ${u.fromInventory})` : ""} — ${u.description || "—"}`
      );
    }
  }
  const skillsLine = formatSkillsLine(s);
  if (skillsLine) lines.push(`- Compétences : ${skillsLine}`);
  return lines.join("\n");
}

export function isCharacterSheetSectionKey(
  value: string
): value is CharacterSheetSectionKey {
  return (CHARACTER_SHEET_SECTION_KEYS as string[]).includes(value);
}

export function mergeCharacterSheet(
  current: CharacterSheet,
  patch: Partial<CharacterSheet>
): CharacterSheet {
  const base = normalizeCharacterSheet(current);
  const next: CharacterSheet = { ...base };
  const textKeys = [
    "rank",
    "background",
    "family",
    "secret",
    "ambition",
    "inventory",
    "equipment",
    "possessions",
    "habitat",
    "servants",
    "money",
    "mount",
    "notes",
    "personality",
    "companionBond",
    "companionAgenda",
  ] as const;
  if (patch.alignment !== undefined) {
    const a = normalizeAlignment(patch.alignment);
    if (a) next.alignment = a;
    else delete next.alignment;
  }
  for (const key of textKeys) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  if (patch.stats !== undefined) {
    next.stats = normalizeStats({ ...base.stats, ...patch.stats });
  }
  if (patch.spells !== undefined) next.spells = normalizeSpells(patch.spells);
  if (patch.attackTypes !== undefined) next.attackTypes = normalizeAttacks(patch.attackTypes);
  if (patch.actions !== undefined) next.actions = normalizeActions(patch.actions);
  if (patch.usableItems !== undefined) next.usableItems = normalizeUsableItems(patch.usableItems);
  if (patch.skills !== undefined) {
    next.skills = normalizeSkills({ ...normalizeSkills(base.skills), ...patch.skills });
  }
  if (patch.companionLoyalty !== undefined) {
    const loyalty = clampCompanionLoyalty(patch.companionLoyalty);
    if (loyalty == null) delete next.companionLoyalty;
    else next.companionLoyalty = loyalty;
  }
  if (patch.companionStance !== undefined) {
    const stance = normalizeCompanionStance(patch.companionStance);
    if (!stance) delete next.companionStance;
    else next.companionStance = stance;
  }
  return normalizeCharacterSheet(next);
}
