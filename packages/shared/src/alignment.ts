/** Neuf alignements D&D (Légal/Neutre/Chaotique × Bon/Neutre/Mauvais). */
export type AlignmentId =
  | "lawful_good"
  | "neutral_good"
  | "chaotic_good"
  | "lawful_neutral"
  | "true_neutral"
  | "chaotic_neutral"
  | "lawful_evil"
  | "neutral_evil"
  | "chaotic_evil";

export const ALIGNMENT_IDS: AlignmentId[] = [
  "lawful_good",
  "neutral_good",
  "chaotic_good",
  "lawful_neutral",
  "true_neutral",
  "chaotic_neutral",
  "lawful_evil",
  "neutral_evil",
  "chaotic_evil",
];

/** Libellés d'axe vertical (lignes) : Bon → Neutre → Mauvais */
export const ALIGNMENT_ROW_LABELS = ["Bon", "Neutre", "Mauvais"] as const;

/** Libellés d'axe horizontal (colonnes) : Légal → Neutre → Chaotique */
export const ALIGNMENT_COL_LABELS = ["Légal", "Neutre", "Chaotique"] as const;

/** Grille 3×3 : lignes = Bon → Neutre → Mauvais ; colonnes = Légal → Neutre → Chaotique */
export const ALIGNMENT_GRID: AlignmentId[][] = [
  ["lawful_good", "neutral_good", "chaotic_good"],
  ["lawful_neutral", "true_neutral", "chaotic_neutral"],
  ["lawful_evil", "neutral_evil", "chaotic_evil"],
];

export const ALIGNMENT_LABELS: Record<AlignmentId, string> = {
  lawful_good: "Loyal Bon",
  neutral_good: "Neutre Bon",
  chaotic_good: "Chaotique Bon",
  lawful_neutral: "Loyal Neutre",
  true_neutral: "Neutre Pur",
  chaotic_neutral: "Chaotique Neutre",
  lawful_evil: "Loyal Mauvais",
  neutral_evil: "Neutre Mauvais",
  chaotic_evil: "Chaotique Mauvais",
};

export const ALIGNMENT_SHORT: Record<AlignmentId, string> = {
  lawful_good: "LB",
  neutral_good: "NB",
  chaotic_good: "CB",
  lawful_neutral: "LN",
  true_neutral: "N",
  chaotic_neutral: "CN",
  lawful_evil: "LM",
  neutral_evil: "NM",
  chaotic_evil: "CM",
};

export function isAlignmentId(value: string): value is AlignmentId {
  return (ALIGNMENT_IDS as string[]).includes(value);
}

export function normalizeAlignment(raw: unknown): AlignmentId | undefined {
  if (raw == null || raw === "") return undefined;
  const s = String(raw).trim();
  if (isAlignmentId(s)) return s;
  return undefined;
}

export function formatAlignmentLabel(id: AlignmentId | undefined): string {
  if (!id) return "—";
  return ALIGNMENT_LABELS[id];
}
