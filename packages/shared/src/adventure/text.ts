/** Normalisation légère pour matcher lieux / sorties (FR, sans accents). */
export function foldAdventureText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreAdventureHaystack(hay: string, needle: string): number {
  const h = foldAdventureText(hay);
  const n = foldAdventureText(needle);
  if (!h || n.length < 3) return 0;
  if (h.includes(n)) return n.length * 3;
  if (n.includes(h) && h.length >= 4) return h.length * 2;
  const words = n.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  return words.reduce((sum, w) => sum + (h.includes(w) ? w.length : 0), 0);
}
