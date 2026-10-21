import type { AdventureEventKind, AdventureNode } from "./types.js";
import { scoreAdventureHaystack } from "./text.js";

const RULES: Array<{ kind: AdventureEventKind; re: RegExp }> = [
  { kind: "enter", re: /\b(j['’]entre|je rentre (dans|chez|à)|je (pousse|ouvre) la porte|je franchis|je rentre)\b/i },
  {
    kind: "use_item",
    re: /\b(j['’]utilise|je bois (la|le|une)|je sors (mon|ma|mes|l['’]|le|la|un|une)|je brandis)\b/i,
  },
  { kind: "leave", re: /\b(je (sors|quitte|m['’]en vais)|on sort|dehors|à la rue|vers le seuil)\b/i },
  {
    kind: "travel",
    re: /\b(je (pars|marche|prends (la |le )?(route|rue|piste|chemin)|suis la piste)|je vais (au|à la|à l['’]|vers|dans)|on (part|marche))\b/i,
  },
  { kind: "inspect", re: /\b(je (regarde|inspecte|cherche|fouille|observe|écoute|flaire|touche))\b/i },
  { kind: "combat", re: /\b(je (frappe|attaque|dégaine|vise|charge|parade)|on se bat)\b/i },
  { kind: "ritual", re: /\b(je (prie|invoque|incante|trace un cercle|offre))\b/i },
  { kind: "rest", re: /\b(je (dors|me pose|m['’]assois|bois|mange|attends)|on camp)\b/i },
  { kind: "social", re: /\b(je (parle|dis|convaincs|marchande|demande|menace|salue)|on discute)\b/i },
];

const MOVE_FROM_KIND: Partial<Record<AdventureNode["kind"], AdventureEventKind>> = {
  threshold: "leave",
  street: "travel",
  road: "travel",
  wilderness: "travel",
  water: "travel",
  haven: "enter",
  home: "enter",
  temple: "enter",
  court: "enter",
  workshop: "enter",
  dungeon: "enter",
  camp: "enter",
};

export function inferAdventureEventKind(
  text: string | undefined,
  fallback: AdventureEventKind = "action",
  node?: AdventureNode | null
): AdventureEventKind {
  const t = text?.trim() ?? "";
  if (!t) return fallback;
  if (node?.exits?.length) {
    let best: { kind: AdventureEventKind; score: number } | null = null;
    for (const ex of node.exits) {
      const score = scoreAdventureHaystack(t, ex.label);
      if (score < 6) continue;
      const kind = MOVE_FROM_KIND[node.kind] ?? "travel";
      if (!best || score > best.score) best = { kind, score };
    }
    if (best) return best.kind;
  }
  for (const rule of RULES) {
    if (rule.re.test(t)) return rule.kind;
  }
  return fallback;
}
