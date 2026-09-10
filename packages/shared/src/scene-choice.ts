import type { StatKey } from "./character-sheet.js";
import { stripMjMetadataComments } from "./mj/mj-response-prep.js";

const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/;

const MIN_CHOICE_LEN = 8;
const MAX_CHOICE_LEN = 240;
const MIN_CHOICES = 2;
const MAX_CHOICES = 8;

export type SceneCheckMode = "dc" | "opposed";

export type SceneCheckSpec = {
  ability: StatKey;
  skillHint: string;
  mode: SceneCheckMode;
  dc: number;
  worldMod: number;
};

function stripInlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`+/g, "")
    .trim();
}

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.,;:!?…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compare deux libellés de choix (ponctuation / accents ignorés). */
export function normalizeChoiceText(text: string): string {
  return normalizeForMatch(text);
}

export function matchChoice(
  choices: string[],
  clicked: string
): string | undefined {
  const n = normalizeChoiceText(clicked);
  if (!n) return undefined;
  return choices.find((c) => normalizeChoiceText(c) === n);
}

/**
 * Dernière liste markdown de 2–8 items du récit MJ (choix de scène).
 * Ignore les listes trop courtes (inventaire d'un mot) ou trop longues.
 */
export function extractMjChoices(markdown: string): string[] {
  const text = stripMjMetadataComments(markdown ?? "");
  if (!text.trim()) return [];

  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of text.split(/\n/)) {
    const m = line.match(LIST_ITEM_RE);
    if (m?.[1]) {
      const item = stripInlineMd(m[1]);
      if (item.length >= MIN_CHOICE_LEN && item.length <= MAX_CHOICE_LEN) {
        current.push(item);
        continue;
      }
    }
    if (current.length) {
      blocks.push(current);
      current = [];
    }
  }
  if (current.length) blocks.push(current);

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.length >= MIN_CHOICES && block.length <= MAX_CHOICES) {
      return block;
    }
  }
  return [];
}

function tensionToDcAndWorldMod(tension: number): { dc: number; worldMod: number } {
  const t = Number.isFinite(tension) ? tension : 0;
  if (t <= -50) return { dc: 15, worldMod: 4 };
  if (t <= -20) return { dc: 13, worldMod: 3 };
  if (t <= 20) return { dc: 12, worldMod: 2 };
  return { dc: 10, worldMod: 1 };
}

/** Détecte les indices de difficulté dans le texte et ajuste le DD. */
function detectDifficultyModifier(text: string): number {
  const normalized = normalizeForMatch(text);
  
  // Très difficile : +3 au DD
  if (/\b(très difficile|extrêmement difficile|quasi impossible|presque impossible|hautement dangereux)\b/iu.test(text)) {
    return 3;
  }
  
  // Difficile : +2 au DD
  if (/\b(difficile|compliqué|risqué|dangereux|périlleux|délicat|ardu)\b/iu.test(text)) {
    return 2;
  }
  
  // Un peu difficile : +1 au DD
  if (/\b(un peu difficile|légèrement difficile|pas évident|pas simple|assez compliqué)\b/iu.test(text)) {
    return 1;
  }
  
  // Facile : -2 au DD
  if (/\b(facile|simple|aisé|évident|sans problème)\b/iu.test(text)) {
    return -2;
  }
  
  // Très facile : -3 au DD
  if (/\b(très facile|extrêmement facile|trivial|enfantin)\b/iu.test(text)) {
    return -3;
  }
  
  return 0;
}

type AbilityHint = {
  ability: StatKey;
  skillHint: string;
  re: RegExp;
  opposed?: boolean;
};

const ABILITY_HINTS: AbilityHint[] = [
  {
    ability: "charisme",
    skillHint: "Tromperie",
    opposed: true,
    re: /\b(mentir|bluff|tromper|duper|baratin|feindre)/iu,
  },
  {
    ability: "charisme",
    skillHint: "Intimidation",
    opposed: true,
    re: /\b(intimid|menac)/iu,
  },
  {
    ability: "charisme",
    skillHint: "Persuasion",
    opposed: true,
    re: /\b(convainc|persuad|n[eé]goci|diplom|s[eé]duir|charmer|marchand)/iu,
  },
  {
    ability: "dexterite",
    skillHint: "Discrétion",
    opposed: true,
    re: /\b(faufil|discre|furtif|cach(er|ette)?|ombre|silenc)/iu,
  },
  {
    ability: "dexterite",
    skillHint: "Escamotage",
    opposed: true,
    re: /\b(voler|pickpocket|chapard|escamot)/iu,
  },
  {
    ability: "dexterite",
    skillHint: "Acrobaties",
    re: /\b(acrobat|equilibr|grimp|sauter|esquiv)/iu,
  },
  {
    ability: "force",
    skillHint: "Athlétisme",
    opposed: true,
    re: /\b(attaqu|frapp|lutt|enfonc|forcer|soulev|porter|ceintur|assomm)/iu,
  },
  {
    ability: "force",
    skillHint: "Athlétisme",
    re: /\b(athl[eé]t|puissance|briser)/iu,
  },
  {
    ability: "intelligence",
    skillHint: "Investigation",
    re: /\b(cherch|indic|enqu[eê]t|fouill|relique|inspect|examin|d[eé]chiffr)/iu,
  },
  {
    ability: "intelligence",
    skillHint: "Arcanes",
    re: /\b(arcane|sortil[eè]ge|magie|grimoire|enchant)/iu,
  },
  {
    ability: "sagesse",
    skillHint: "Perception",
    re: /\b(explor|environs?|[eé]claireur|alli[eé]s?|observ|guett|percevoir|perception|rep[eé]r)/iu,
  },
  {
    ability: "sagesse",
    skillHint: "Survie",
    re: /\b(survie|piste|route|chemin|wilderness|orientation|rep[aî]ire)/iu,
  },
  {
    ability: "sagesse",
    skillHint: "Perspicacité",
    opposed: true,
    re: /\b(perspicacit|d[eé]masqu)/iu,
  },
  {
    ability: "constitution",
    skillHint: "Constitution",
    re: /\b(encaiss|endur|r[eé]sist|poison|tenir bon|fatigue)/iu,
  },
];

const OPPOSE_FALLBACK_RE =
  /\b(oppos|emp[eê]ch|contredire|rival|interposer|contester)\b/iu;

/** Caractéristique d'opposition (5e : Persuasion vs Perspicacité, Discrétion vs Perception). */
export function opposeAbilityFor(actorAbility: StatKey): StatKey {
  if (actorAbility === "charisme") return "sagesse";
  if (actorAbility === "dexterite") return "sagesse";
  return actorAbility;
}

/** Aide : même caractéristique, ou Perception pour une enquête. */
export function helpAbilityFor(actorAbility: StatKey): StatKey {
  if (actorAbility === "intelligence") return "sagesse";
  return actorAbility;
}

export function inferSceneCheck(
  choice: string,
  tension = 0
): SceneCheckSpec {
  const { dc: baseDc, worldMod } = tensionToDcAndWorldMod(tension);
  const difficultyMod = detectDifficultyModifier(choice);
  const dc = Math.max(8, Math.min(20, baseDc + difficultyMod));
  const normalized = normalizeForMatch(choice);

  for (const hint of ABILITY_HINTS) {
    if (hint.re.test(normalized) || hint.re.test(choice)) {
      return {
        ability: hint.ability,
        skillHint: hint.skillHint,
        mode: hint.opposed || OPPOSE_FALLBACK_RE.test(normalized) ? "opposed" : "dc",
        dc,
        worldMod,
      };
    }
  }

  return {
    ability: "sagesse",
    skillHint: "Perception",
    mode: OPPOSE_FALLBACK_RE.test(normalized) ? "opposed" : "dc",
    dc,
    worldMod,
  };
}
