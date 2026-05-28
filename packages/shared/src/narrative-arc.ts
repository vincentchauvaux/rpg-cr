/** Trame principale de campagne — objectif, conflit, beat actuel. */
export interface NarrativeArc {
  mainPlot: string;
  currentBeat: string;
  introducedAt: string;
}

export function parseNarrativeArcJson(raw: string | null | undefined): NarrativeArc | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const mainPlot = String(o.mainPlot ?? "").trim();
    const currentBeat = String(o.currentBeat ?? "").trim();
    const introducedAt = String(o.introducedAt ?? "").trim();
    if (!mainPlot && !currentBeat) return null;
    return {
      mainPlot: mainPlot || "—",
      currentBeat: currentBeat || "—",
      introducedAt: introducedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function formatNarrativeArcForMj(arc: NarrativeArc | null): string {
  if (!arc?.mainPlot?.trim() && !arc?.currentBeat?.trim()) {
    return "Trame principale non encore établie — à poser en introduction ou au « Commencer ».";
  }
  return (
    `Objectif / conflit : ${arc.mainPlot || "—"}\n` +
    `Beat narratif actuel : ${arc.currentBeat || "—"}`
  );
}
