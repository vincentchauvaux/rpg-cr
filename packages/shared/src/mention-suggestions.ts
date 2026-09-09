export type MentionCandidateKind = "player" | "companion" | "character";

/** Marionnettes IA et noms du canon — pas les autres PJ. */
export function isNpcMentionKind(kind: MentionCandidateKind): boolean {
  return kind === "companion" || kind === "character";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rangesOverlap(
  start: number,
  end: number,
  ranges: [number, number][]
): boolean {
  return ranges.some(([a, b]) => start < b && end > a);
}

/** Candidats effectivement apostrophés avec `@` dans le texte (plus long d'abord). */
export function findMentionedCandidates(
  content: string,
  candidates: MentionCandidate[]
): MentionCandidate[] {
  const text = content.trim();
  if (!text || !candidates.length) return [];

  const sorted = [...candidates].sort((a, b) => b.name.length - a.name.length);
  const found: MentionCandidate[] = [];
  const seen = new Set<string>();
  const usedRanges: [number, number][] = [];

  for (const candidate of sorted) {
    const name = candidate.name.trim();
    if (name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    const re = new RegExp(
      `@\\s*(${escapeRegExp(name)})(?=$|[^\\p{L}\\p{N}'’-])`,
      "giu"
    );
    let match: RegExpExecArray | null;
    let matched = false;
    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (rangesOverlap(start, end, usedRanges)) continue;
      usedRanges.push([start, end]);
      matched = true;
      break;
    }
    if (!matched) continue;
    seen.add(key);
    found.push(candidate);
  }

  return found;
}

export function findMentionedNpcs(
  content: string,
  candidates: MentionCandidate[]
): MentionCandidate[] {
  return findMentionedCandidates(content, candidates).filter((c) =>
    isNpcMentionKind(c.kind)
  );
}

export interface MentionCandidate {
  name: string;
  kind: MentionCandidateKind;
  hint?: string;
}

export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
  limit = 8
): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  let list = [...candidates];
  if (q) {
    list = list.filter((c) => c.name.toLowerCase().includes(q));
    list.sort((a, b) => {
      const na = a.name.toLowerCase();
      const nb = b.name.toLowerCase();
      const aStarts = na.startsWith(q) ? 0 : 1;
      const bStarts = nb.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      const aWord = na.split(/\s+/)[0] === q ? 0 : 1;
      const bWord = nb.split(/\s+/)[0] === q ? 0 : 1;
      if (aWord !== bWord) return aWord - bWord;
      return na.localeCompare(nb, "fr");
    });
  }
  return list.slice(0, limit);
}

/** Détecte une mention @ en cours de frappe à la position du curseur. */
export function parseActiveMention(
  text: string,
  cursorIndex: number
): { start: number; query: string } | null {
  const before = text.slice(0, cursorIndex);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const fragment = before.slice(at + 1);
  if (/[\s\n]/.test(fragment)) return null;
  return { start: at, query: fragment };
}

export function applyMentionSelection(
  text: string,
  start: number,
  cursorIndex: number,
  name: string
): { next: string; cursor: number } {
  const before = text.slice(0, start);
  const after = text.slice(cursorIndex);
  const insert = `@${name} `;
  const next = before + insert + after;
  return { next, cursor: before.length + insert.length };
}
