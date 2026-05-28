import type { CharacterSheet, SkillProgress } from "./types.js";

/** Soirée d'étude / lecture (ex. un livre). */
export const PROGRESS_PER_EVENING = 8;
/** Action courte (entraînement, répétition). */
export const PROGRESS_PER_ACTION = 3;

export const SKILL_LABELS: Record<string, string> = {
  erudition: "Érudition",
  alchimie: "Alchimie",
  diplomatie: "Diplomatie",
  furtivite: "Furtivité",
  natation: "Natation",
  nage: "Nage",
  crawl: "Crawl",
  equitation: "Équitation",
  arc: "Tir à l'arc",
  escrime: "Escrime",
  medecine: "Médecine",
  magie_mineure: "Magie mineure",
  sort_mineur: "Sort mineur",
  intimidation: "Intimidation",
  persuasion: "Persuasion",
  survie: "Survie",
  artisanat: "Artisanat",
};

/** Compétences reconnues à la création / validation API. */
export const KNOWN_SKILL_IDS = Object.keys(SKILL_LABELS);

export interface RelatedSkillUnlockRule {
  sourceSkillId: string;
  /** Mots-clés d'activité (livre, piscine, sortilège…). */
  activityTags: string[];
  unlockSkillId: string;
}

export const RELATED_SKILL_UNLOCKS: RelatedSkillUnlockRule[] = [
  { sourceSkillId: "natation", activityTags: ["livre", "manuel", "étude", "lecture"], unlockSkillId: "crawl" },
  { sourceSkillId: "natation", activityTags: ["livre", "manuel", "étude", "lecture"], unlockSkillId: "nage" },
  { sourceSkillId: "erudition", activityTags: ["magie", "grimoire", "arcane"], unlockSkillId: "magie_mineure" },
  { sourceSkillId: "magie_mineure", activityTags: ["grimoire", "rituel", "étude"], unlockSkillId: "sort_mineur" },
];

export interface SkillProgressApplyResult {
  sheet: CharacterSheet;
  skillId: string;
  previousLevel: number;
  newLevel: number;
  previousProgress: number;
  newProgress: number;
  leveledUp: boolean;
  progressAdded: number;
}

export interface SkillUnlockResult {
  sheet: CharacterSheet;
  unlockedSkillId: string;
  sourceSkillId: string;
}

export function skillLabel(skillId: string): string {
  return SKILL_LABELS[skillId] ?? skillId.replace(/_/g, " ");
}

export function clampSkillProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function clampSkillLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function normalizeSkillProgress(raw?: Partial<SkillProgress>): SkillProgress {
  return {
    level: clampSkillLevel(raw?.level ?? 0),
    progress: clampSkillProgress(raw?.progress ?? 0),
    ...(raw?.unlockedFrom?.trim() ? { unlockedFrom: raw.unlockedFrom.trim() } : {}),
  };
}

export function normalizeSkills(
  raw?: Record<string, Partial<SkillProgress>>
): Record<string, SkillProgress> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, SkillProgress> = {};
  for (const [id, entry] of Object.entries(raw)) {
    const key = id.trim().toLowerCase();
    if (!key) continue;
    out[key] = normalizeSkillProgress(entry);
  }
  return out;
}

export function isKnownSkillId(skillId: string, sheet?: CharacterSheet): boolean {
  const id = skillId.trim().toLowerCase();
  if (!id) return false;
  if ((KNOWN_SKILL_IDS as string[]).includes(id)) return true;
  if (sheet?.skills && id in sheet.skills) return true;
  return false;
}

function ensureSkillEntry(
  skills: Record<string, SkillProgress>,
  skillId: string
): SkillProgress {
  return skills[skillId] ?? { level: 0, progress: 0 };
}

/** Ajoute de la progression ; niveau++ si ≥ 100 %, surplus reporté. */
export function applySkillProgress(
  sheet: CharacterSheet,
  skillId: string,
  delta: number
): SkillProgressApplyResult {
  const id = skillId.trim().toLowerCase();
  const skills = { ...normalizeSkills(sheet.skills) };
  const entry = ensureSkillEntry(skills, id);
  const previousLevel = entry.level;
  const previousProgress = entry.progress;
  const added = Math.max(0, Number(delta) || 0);

  let level = entry.level;
  let progress = entry.progress + added;
  while (progress >= 100) {
    progress -= 100;
    level += 1;
  }

  skills[id] = {
    ...entry,
    level,
    progress: clampSkillProgress(progress),
  };

  const nextSheet: CharacterSheet = { ...sheet, skills };
  return {
    sheet: nextSheet,
    skillId: id,
    previousLevel,
    newLevel: level,
    previousProgress,
    newProgress: skills[id].progress,
    leveledUp: level > previousLevel,
    progressAdded: added,
  };
}

/** Entraînement : intensité 1 ≈ action courte, ≥ 4 ≈ soirée. */
export function applySkillPractice(
  sheet: CharacterSheet,
  skillId: string,
  hoursOrIntensity: number
): SkillProgressApplyResult {
  const intensity = Math.max(0, Number(hoursOrIntensity) || 0);
  const delta =
    intensity >= 4
      ? PROGRESS_PER_EVENING
      : intensity >= 1
        ? PROGRESS_PER_ACTION
        : PROGRESS_PER_ACTION * intensity;
  return applySkillProgress(sheet, skillId, delta);
}

function tagsMatch(activityTags: string[], ruleTags: string[]): boolean {
  const normalized = activityTags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!normalized.length) return false;
  return ruleTags.some((tag) =>
    normalized.some((a) => a.includes(tag.toLowerCase()) || tag.toLowerCase().includes(a))
  );
}

/** Débloque une compétence liée si règles et tags correspondent. */
export function tryUnlockRelatedSkill(
  sheet: CharacterSheet,
  sourceSkillId: string,
  activityTags: string[] = []
): SkillUnlockResult | null {
  const sourceId = sourceSkillId.trim().toLowerCase();
  const skills = { ...normalizeSkills(sheet.skills) };

  for (const rule of RELATED_SKILL_UNLOCKS) {
    if (rule.sourceSkillId !== sourceId) continue;
    if (!tagsMatch(activityTags, rule.activityTags)) continue;
    if (skills[rule.unlockSkillId]) continue;

    skills[rule.unlockSkillId] = {
      level: 0,
      progress: 0,
      unlockedFrom: sourceId,
    };
    return {
      sheet: { ...sheet, skills },
      unlockedSkillId: rule.unlockSkillId,
      sourceSkillId: sourceId,
    };
  }
  return null;
}

export function formatSkillsLine(sheet: CharacterSheet): string {
  const skills = normalizeSkills(sheet.skills);
  const ids = Object.keys(skills).sort();
  if (!ids.length) return "";
  return ids
    .map((id) => {
      const s = skills[id];
      return `${skillLabel(id)} niv.${s.level} (${s.progress} %)`;
    })
    .join(" · ");
}
