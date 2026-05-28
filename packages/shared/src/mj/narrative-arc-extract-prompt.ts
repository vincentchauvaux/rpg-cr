import type { NarrativeArc } from "../narrative-arc.js";

export interface ExtractedNarrativeArc {
  mainPlot?: string;
  currentBeat?: string;
}

export function buildNarrativeArcExtractMessages(mjText: string): {
  role: "system" | "user";
  content: string;
}[] {
  return [
    {
      role: "system",
      content: `Tu es l'archiviste narratif d'une campagne JDR médiéval-fantastique.
À partir du dernier récit du MJ, déduis la **trame principale** et le **beat actuel**.

Réponds UNIQUEMENT avec un objet JSON valide :
{
  "mainPlot": "Objectif global, conflit central, enjeu (1–2 phrases, français)",
  "currentBeat": "Ce qui se joue maintenant dans l'histoire (1 phrase)"
}

Règles :
- Si le MJ ouvre une nouvelle campagne, formule mainPlot à partir de l'intro.
- Si la trame existait déjà, affine-la sans la contredire sans raison forte.
- Ne invente pas de quête absente du texte ; en cas de doute, reformule prudemment.`,
    },
    {
      role: "user",
      content: `Texte MJ à analyser :\n\n${mjText.slice(0, 6000)}`,
    },
  ];
}

export function parseExtractedNarrativeArc(raw: string): ExtractedNarrativeArc | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as Record<string, unknown>;
    const mainPlot = String(o.mainPlot ?? "").trim();
    const currentBeat = String(o.currentBeat ?? "").trim();
    if (!mainPlot && !currentBeat) return null;
    return {
      ...(mainPlot ? { mainPlot } : {}),
      ...(currentBeat ? { currentBeat } : {}),
    };
  } catch {
    return null;
  }
}

export function mergeArcPatch(
  current: NarrativeArc | null,
  patch: ExtractedNarrativeArc
): NarrativeArc {
  const now = new Date().toISOString();
  return {
    mainPlot: patch.mainPlot?.trim() || current?.mainPlot || "—",
    currentBeat: patch.currentBeat?.trim() || current?.currentBeat || "—",
    introducedAt: current?.introducedAt || now,
  };
}
