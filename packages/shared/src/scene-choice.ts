import type { StatKey } from "./character-sheet.js";
import { stripMjMetadataComments } from "./mj/mj-response-prep.js";

/** Markdown `-` / `*` / numéros, puces Unicode, tirets cadratin (souvent avec ligne vide entre items). */
const LIST_ITEM_RE = /^\s*(?:[-*+•●◦‣·]|[–—]|\d+[.)])\s+(.+?)\s*$/;

const MIN_CHOICE_LEN = 8;
const MAX_CHOICE_LEN = 240;
const MIN_CHOICES = 2;
const MAX_CHOICES = 8;

const CHOICE_PROMPT_RE =
  /que (faites|feras|choisissez|décidez|souhaitez)|que fais[- ]tu/iu;

/** Impératif 2e pers. (`Examinez`) ou infinitif (`Examiner`, `Prendre`). */
const PLAIN_OPTION_RE =
  /^(?:Ou bien\s+)?(?:Vous pouvez(?: aussi)?\s+)?[\p{L}][\p{L}'’-]*(?:ez|er|ir|re|oir)\b/u;

type ChoiceBlock = { start: number; end: number; items: string[] };

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

function parseListItem(line: string): string | null {
  const m = line.match(LIST_ITEM_RE);
  if (!m?.[1]) return null;
  const item = stripInlineMd(m[1]);
  if (item.length < MIN_CHOICE_LEN || item.length > MAX_CHOICE_LEN) return null;
  return item;
}

function isNarrativeLeadIn(text: string): boolean {
  return /^(Le |La |Les |Il |Elle |On |Ce |Cette |Votre |Tu |Vous êtes|Vous vous|Vous avez|Un |Une )/u.test(
    text
  );
}

function parsePlainOption(line: string): string | null {
  const t = stripInlineMd(line).trim();
  if (t.length < MIN_CHOICE_LEN || t.length > MAX_CHOICE_LEN) return null;
  if (parseListItem(line)) return null;
  if (/^#{1,6}\s/.test(t) || /^<!--/.test(t)) return null;
  if (CHOICE_PROMPT_RE.test(t)) return null;
  if (isNarrativeLeadIn(t) && !/^Une? autre verre/u.test(t)) return null;
  if (!PLAIN_OPTION_RE.test(t)) return null;
  return t;
}

function findChoiceBlocksFromLines(
  lines: string[],
  parse: (line: string) => string | null
): ChoiceBlock[] {
  const blocks: ChoiceBlock[] = [];
  let current: ChoiceBlock | null = null;

  const flush = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const item = parse(line);
    if (item) {
      if (!current) current = { start: i, end: i, items: [item] };
      else {
        current.end = i;
        current.items.push(item);
      }
      continue;
    }
    if (current && line.trim() === "") continue;
    flush();
  }
  flush();
  return blocks;
}

function lastValidChoiceBlock(text: string): ChoiceBlock | null {
  const lines = text.split("\n");
  const listBlocks = findChoiceBlocksFromLines(lines, parseListItem);
  for (let i = listBlocks.length - 1; i >= 0; i--) {
    const block = listBlocks[i];
    if (block.items.length >= MIN_CHOICES && block.items.length <= MAX_CHOICES) {
      return block;
    }
  }

  const plainBlocks = findChoiceBlocksFromLines(lines, parsePlainOption);
  for (let i = plainBlocks.length - 1; i >= 0; i--) {
    const block = plainBlocks[i];
    if (block.items.length >= MIN_CHOICES && block.items.length <= MAX_CHOICES) {
      const before = lines[block.start - 1]?.trim() ?? "";
      const before2 = lines[block.start - 2]?.trim() ?? "";
      const prompted =
        CHOICE_PROMPT_RE.test(before) ||
        CHOICE_PROMPT_RE.test(before2) ||
        CHOICE_PROMPT_RE.test(text.slice(Math.max(0, text.length - 800)));
      if (prompted || block.items.length >= 3) return block;
    }
  }
  return null;
}

/**
 * Dernière liste de 2–8 options du récit MJ (choix de scène).
 * Accepte markdown, puces, et lignes d'impératif séparées (y compris par une ligne vide).
 */
export function extractMjChoices(markdown: string): string[] {
  const text = stripMjMetadataComments(markdown ?? "");
  if (!text.trim()) return [];
  return lastValidChoiceBlock(text)?.items ?? [];
}

/** Retire la dernière liste de choix cliquables (affichage compact via <select>). */
export function stripTrailingMjChoiceList(markdown: string): string {
  const display = stripMjMetadataComments(markdown ?? "");
  if (!display.trim()) return display;
  const block = lastValidChoiceBlock(display);
  if (!block) return display.trim();
  const lines = display.split("\n");
  return [...lines.slice(0, block.start), ...lines.slice(block.end + 1)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    re: /\b(attaqu|frapp|lutt|enfonc|forcer la|soulev|assomm|smash|fracass)\b/iu,
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

/**
 * Gestes sûrs / questions / fouille de sa propre ceinture : pas de d20.
 * (Sinon « ceinture » ou « rejoins Timmy pour enquêter » devenaient des épreuves absurdes.)
 */
export function isAutomaticSceneChoice(choice: string): boolean {
  const raw = choice.trim();
  if (!raw) return true;
  const t = normalizeForMatch(raw);

  if (/^(demande|demander|parle|parler|discuter|signale|signaler|interroge|interroger)\b/iu.test(raw)) {
    return true;
  }
  if (/\b(rejoins?|rejoint)\b/iu.test(t)) return true;
  if (/\b(attendre|moment seul|prendre un moment|réfléchir|quel est mon but)\b/iu.test(t)) {
    return true;
  }
  if (/\b(ramasse|ramasser|garde la|garder la)\b/iu.test(t)) return true;
  if (/\b(ceinture|poches?|inventaire|équipement)\b/iu.test(t)) return true;
  if (
    /\b(regarder ce que|ce que j['’]?ai gagn|ce que j['’]?ai obtenu)\b/iu.test(t)
  ) {
    return true;
  }
  if (
    /\b(ignor[ez]|ignorer le|passe[rz] à|conversation habituelle|un autre verre|demander un verre|boire|chope)\b/iu.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(rentre[rz]? chez|chez moi|se lève|je me lève|aller dormir|me couche|travailler la terre)\b/iu.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(je rentre|j['’]rentre|on rentre|rentrer|je entre|j['’]entre)\b/iu.test(t) &&
    !/\b(forc|effract|crochet|enfonc)\b/iu.test(t)
  ) {
    return true;
  }
  return false;
}
