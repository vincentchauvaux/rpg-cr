import {
  clampStat,
  normalizeStats,
  STAT_LABELS,
  type StatKey,
} from "./character-sheet.js";
import { stripMjMetadataComments } from "./mj/mj-response-prep.js";
import type { CharacterSheet, ChatMessage } from "./types.js";

import type { PlayerRollMeta } from "./dice-roll.js";
import { ROLL_QUICK_ACTION_HINT, playerMessageDeclaresRoll } from "./dice-roll.js";

export type QuickUseOption = {
  id: string;
  label: string;
  insert: string;
  rollMeta?: PlayerRollMeta;
  hint?: string;
};

const ROLL_REQUEST_RE =
  /\b(jet(?:ez|er|e)?|lance(?:z|r|e)?|roule(?:z|r|e)?|tente(?:z)?|épreuve|test(?:ez)?)\b[^\n]{0,100}\b(d20|d12|d10|d8|d6|d4|d[eé]s?\s*(?:de\s+)?(?:20|12|10|8|6|4|vingt))\b|\bjet(?:ez|er|e)?\s+un\s+d[eé]\s*(20|12|10|8|6|4)\b|\b(d20|d12|d10|d8|d6|d4)\b[^\n]{0,60}\b(jet|lance|roule)\b|\bjet\s+(?:de\s+)?(?:d')?(?:dext[eé]rit[eé]|force|constitution|intelligence|sagesse|charisme)\b/iu;

const PLAYER_ROLL_RESPONSE_RE = /(?::\s*\d{1,2}\s*[+-]?\d*\s*=\s*\d{1,2}|\*\*\d+\*\*)/;

function playerMessageHasRollResult(content: string): boolean {
  return playerMessageDeclaresRoll(content) || PLAYER_ROLL_RESPONSE_RE.test(content);
}

const DICE_IN_TEXT_RE = /\b(d20|d12|d10|d8|d6|d4)\b|d[eé]\s*(20|12|10|8|6|4)\b/iu;

/** Normalise accents/combinaisons Unicode pour matcher DEXTERITÉ, dextérité, etc. */
function normalizeForStatMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

const EXPLICIT_ROLL_STAT_RE =
  /jet\s+de\s+(dext[eé]rit[eé]|dexterite|force|constitution|intelligence|sagesse|charisme)\b/iu;

const EXPLICIT_ROLL_STAT_MAP: Record<string, StatKey> = {
  dexterite: "dexterite",
  dextérité: "dexterite",
  dex: "dexterite",
  force: "force",
  constitution: "constitution",
  con: "constitution",
  intelligence: "intelligence",
  int: "intelligence",
  sagesse: "sagesse",
  sag: "sagesse",
  charisme: "charisme",
  cha: "charisme",
};

const CATEGORY_STAT_HINTS: { key: StatKey; re: RegExp }[] = [
  { key: "dexterite", re: /\bchair\b/iu },
];

const STAT_ALIASES: { key: StatKey; re: RegExp }[] = [
  {
    key: "dexterite",
    re: /\b(dexterite|dext[eé]rit[eé]|agilit[eé]|acrobatie|discr[eé]tion|r[eé]flexes?)\b/iu,
  },
  { key: "force", re: /\b(force|athl[eé]tisme|puissance)\b/iu },
  {
    key: "constitution",
    re: /\b(constitution|endurance|r[eé]sistance)\b/iu,
  },
  {
    key: "intelligence",
    re: /\b(intelligence|investigation|arcane|histoire)\b/iu,
  },
  {
    key: "sagesse",
    re: /\b(sagesse|perception|intuition|survie|m[eé]decine)\b/iu,
  },
  {
    key: "charisme",
    re: /\b(charisme|persuasion|intimidation|représentation|diplomatie)\b/iu,
  },
];

export function statModifier(score: number): number {
  return Math.floor((clampStat(score) - 10) / 2);
}

export function formatStatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function inferDiceFromText(text: string): string {
  const m = text.match(DICE_IN_TEXT_RE);
  if (!m) return "d20";
  if (m[1]) return m[1].toLowerCase();
  const faces = m[2];
  return faces ? `d${faces}` : "d20";
}

function inferStatFromText(text: string): StatKey | undefined {
  const normalized = normalizeForStatMatch(text);

  const explicit = normalized.match(EXPLICIT_ROLL_STAT_RE);
  if (explicit?.[1]) {
    const token = explicit[1].normalize("NFD").replace(/\p{M}/gu, "");
    const mapped = EXPLICIT_ROLL_STAT_MAP[token] ?? EXPLICIT_ROLL_STAT_MAP[explicit[1].toLowerCase()];
    if (mapped) return mapped;
  }

  for (const { key, re } of CATEGORY_STAT_HINTS) {
    if (re.test(normalized)) return key;
  }

  for (const { key, re } of STAT_ALIASES) {
    if (re.test(normalized)) return key;
  }
  return undefined;
}

function resolveStatForRoll(
  mjText: string,
  priorPlayerText: string,
  sheet: CharacterSheet
): StatKey {
  const fromMj = inferStatFromText(mjText);
  if (fromMj) return fromMj;
  const fromPlayer = inferStatFromText(priorPlayerText);
  if (fromPlayer) return fromPlayer;

  return "dexterite";
}

export function mjMessageRequestsRoll(content: string): boolean {
  const text = stripMjMetadataComments(content).trim();
  if (!text) return false;
  return ROLL_REQUEST_RE.test(text);
}

export function buildMjRollSuggestions(
  messages: Pick<ChatMessage, "kind" | "playerId" | "content">[],
  sheet: CharacterSheet
): QuickUseOption[] {
  let lastMjIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.kind === "mj") {
      lastMjIndex = i;
      break;
    }
  }
  if (lastMjIndex < 0) return [];

  const mjMessage = messages[lastMjIndex];
  const mjText = stripMjMetadataComments(mjMessage.content);
  if (!mjMessageRequestsRoll(mjText)) return [];

  const afterMj = messages.slice(lastMjIndex + 1);
  if (
    afterMj.some(
      (m) =>
        (m.kind === "action" || m.kind === "say" || m.kind === "chat") &&
        playerMessageHasRollResult(m.content)
    )
  ) {
    return [];
  }

  let priorPlayerText = "";
  for (let i = lastMjIndex - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && (m.kind === "action" || m.kind === "say" || m.kind === "chat")) {
      priorPlayerText = m.content;
      break;
    }
  }

  const statKey = resolveStatForRoll(mjText, priorPlayerText, sheet);
  const stats = normalizeStats(sheet.stats);
  const score = stats[statKey] ?? 10;
  const mod = statModifier(score);
  const dice = inferDiceFromText(mjText);
  const statShort =
    statKey === "dexterite"
      ? "dex"
      : statKey === "constitution"
        ? "con"
        : statKey === "intelligence"
          ? "int"
          : statKey === "charisme"
            ? "cha"
            : statKey === "sagesse"
              ? "sag"
              : "for";
  const statLabel = STAT_LABELS[statKey].toLowerCase();

  return [
    {
      id: `roll-${dice}-${statKey}`,
      label: `🎲 ${dice} ${statShort}`,
      insert: "",
      rollMeta: {
        dice,
        statLabel,
        statMod: mod,
        statScore: score,
      },
      hint: ROLL_QUICK_ACTION_HINT,
    },
  ];
}

export function buildSheetQuickUseOptions(sheet: CharacterSheet): QuickUseOption[] {
  const opts: QuickUseOption[] = [];
  for (const sp of sheet.spells ?? []) {
    if (!sp.name.trim()) continue;
    opts.push({
      id: `spell-${sp.name}`,
      label: `✦ ${sp.name}`,
      insert: `J'utilise le sort « ${sp.name} »${sp.description ? ` — ${sp.description}` : ""}`,
    });
  }
  for (const u of sheet.usableItems ?? []) {
    if (!u.name.trim()) continue;
    opts.push({
      id: `item-${u.name}`,
      label: `🎒 ${u.name}`,
      insert: `J'utilise « ${u.name} »${u.description ? ` — ${u.description}` : ""}`,
    });
  }
  for (const a of sheet.actions ?? []) {
    if (!a.name.trim()) continue;
    opts.push({
      id: `action-${a.name}`,
      label: `⚔ ${a.name}`,
      insert: a.description?.trim() || a.name,
    });
  }
  return opts;
}

export function buildQuickUseOptions(
  sheet: CharacterSheet,
  messages: Pick<ChatMessage, "kind" | "playerId" | "content">[]
): QuickUseOption[] {
  const rollOpts = buildMjRollSuggestions(messages, sheet);
  const sheetOpts = buildSheetQuickUseOptions(sheet);
  return [...rollOpts, ...sheetOpts];
}
