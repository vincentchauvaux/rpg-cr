import { clampStat } from "./character-sheet.js";

function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function parseDiceFaces(dice: string): number {
  const m = dice.trim().match(/^d(\d+)$/i);
  return m ? Number.parseInt(m[1], 10) : 20;
}

export function rollDie(faces: number): number {
  const f = Math.max(2, Math.floor(faces));
  return Math.floor(Math.random() * f) + 1;
}

export type PlayerRollMeta = {
  dice: string;
  statLabel: string;
  statMod: number;
};

/** Message action avec résultat chiffré pour que le MJ résolve l'issue. */
export function formatPlayerRollMessage(
  meta: PlayerRollMeta,
  naturalRoll?: number
): string {
  const faces = parseDiceFaces(meta.dice);
  const natural = naturalRoll ?? rollDie(faces);
  const modLabel = formatMod(meta.statMod);
  const total = natural + meta.statMod;
  return (
    `Je lance un ${meta.dice} sur ma ${meta.statLabel} : ` +
    `${natural} ${modLabel} = ${total}.`
  );
}

const PLAYER_ROLL_RESULT_RE =
  /\b(je lance|j'ai lancé).*(?::\s*\d{1,2}\s*[+-]?\d*\s*=\s*\d{1,2}|\*\*\d+\*\*|=\s*\*\*\d+\*\*)/iu;

export function playerMessageDeclaresRoll(content: string): boolean {
  return PLAYER_ROLL_RESULT_RE.test(content.trim());
}

/** Rappel court des paliers +2/0/-2 du MJ (issues narratives, pas le modificateur de stat). */
export function extractMjRollTierHint(mjText: string): string | null {
  const lines: string[] = [];
  if (/réussite\s+critique\s*\(\+?\s*2\s*\)/iu.test(mjText)) {
    lines.push("réussite critique (+2)");
  }
  if (/réussite\s+simple\s*\(\s*0\s*\)/iu.test(mjText)) {
    lines.push("réussite simple (0)");
  }
  if (/échec\s+critique\s*\(-\s*2\s*\)/iu.test(mjText)) {
    lines.push("échec critique (−2)");
  }
  if (!lines.length) return null;
  return (
    "Palier(s) annoncé(s) par le MJ : " +
    lines.join(" ; ") +
    ". (Ces +2/0/−2 sont des **issues** selon la qualité du jet — pas le bonus de caractéristique.)"
  );
}

export const ROLL_QUICK_ACTION_HINT =
  "Le (+X) sur votre jet = bonus de caractéristique (ex. DEX 15 → +2). " +
  "Les +2 / 0 / −2 dans le texte du MJ = trois issues possibles après le résultat du dé.";
