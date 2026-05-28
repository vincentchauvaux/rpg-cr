import type { NarrativeFactType } from "../types.js";

export const NARRATIVE_FACT_TYPES: NarrativeFactType[] = [
  "spell_granted",
  "item_found",
  "stat_change",
  "rule_established",
  "ability_unlocked",
  "other",
];

export const NARRATIVE_FACT_LABELS: Record<NarrativeFactType, string> = {
  spell_granted: "Sort ou pouvoir accordé",
  item_found: "Objet trouvé ou reçu",
  stat_change: "Changement de caractéristique",
  rule_established: "Règle ou fait établi",
  ability_unlocked: "Capacité débloquée",
  other: "Autre fait canon",
};

export function buildNarrativeFactsExtractMessages(mjText: string): {
  role: "system" | "user";
  content: string;
}[] {
  return [
    {
      role: "system",
      content: `Tu es l'archiviste d'une campagne JDR médiéval-fantastique.
Extrais les **faits établis** par le MJ dans le récit suivant — ce que le MJ a dit devient canon pour la suite.

Types possibles (fact_type) :
- spell_granted : sort, pouvoir, bénédiction accordée
- item_found : objet, artefact, ressource obtenue
- stat_change : modification de caractéristique ou état physique/mental notable
- rule_established : règle du monde, loi magique, contrainte narrative
- ability_unlocked : talent, technique, accès narratif nouveau
- other : autre fait important

Réponds UNIQUEMENT avec un tableau JSON valide (peut être vide []) :
[
  {
    "fact_type": "spell_granted",
    "summary": "Phrase courte en français",
    "payload": { "playerName": "?", "name": "?", "detail": "?" }
  }
]

Ne invente rien absent du texte MJ. Maximum 8 faits.`,
    },
    {
      role: "user",
      content: `Texte MJ à analyser :\n\n${mjText.slice(0, 6000)}`,
    },
  ];
}

export interface ExtractedNarrativeFact {
  fact_type: NarrativeFactType;
  summary: string;
  payload: Record<string, unknown>;
}

export function parseExtractedFacts(raw: string): ExtractedNarrativeFact[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const o = x as Record<string, unknown>;
        const typeRaw = String(o.fact_type ?? "other");
        const fact_type = (NARRATIVE_FACT_TYPES as string[]).includes(typeRaw)
          ? (typeRaw as NarrativeFactType)
          : "other";
        return {
          fact_type,
          summary: String(o.summary ?? "").trim(),
          payload:
            o.payload && typeof o.payload === "object"
              ? (o.payload as Record<string, unknown>)
              : {},
        };
      })
      .filter((f) => f.summary.length > 0)
      .slice(0, 8);
  } catch {
    return [];
  }
}
