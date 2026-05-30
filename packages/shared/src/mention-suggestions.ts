export type MentionCandidateKind = "player" | "companion" | "character";

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
