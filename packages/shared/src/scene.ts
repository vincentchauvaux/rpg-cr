/** Tension narrative : −100 (périlleux) … 0 (neutre) … +100 (favorable). */
export type TensionLevel = number;

export interface SceneState {
  location: string;
  mood: string;
  tension: TensionLevel;
  updatedAt: string;
  people?: string;
  timeOfDay?: string;
  weather?: string;
}

export interface SceneLogEntry extends SceneState {
  id: string;
  roomId: string;
  sourceMessageId: string | null;
}

export const TENSION_MIN = -100;
export const TENSION_MAX = 100;

export function clampTension(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(TENSION_MIN, Math.min(TENSION_MAX, Math.round(value)));
}

/** Libellé court pour l'extrémité gauche / droite du cadran. */
export const TENSION_AXIS_LEFT = "Périlleux";
export const TENSION_AXIS_RIGHT = "Serein";

export function tensionToAngleDeg(tension: number): number {
  const t = clampTension(tension);
  return 90 - (t / 100) * 90;
}

/**
 * Ligne « moment · météo », vidée de ce que l'ambiance dit déjà — les ouvertures
 * recopiaient l'ambiance dans la météo et la même phrase s'affichait deux fois.
 */
export function getSceneWhenDisplayLabel(
  scene: Pick<SceneState, "timeOfDay" | "weather"> | null | undefined,
  moodLabel?: string | null,
  separator = " · "
): string | null {
  const bits = [scene?.timeOfDay?.trim(), scene?.weather?.trim()].filter(
    (b): b is string => Boolean(b)
  );
  if (bits.length === 0) return null;
  const mood = (moodLabel ?? "").trim().toLowerCase();
  const kept = mood ? bits.filter((b) => !mood.includes(b.toLowerCase())) : bits;
  return kept.length > 0 ? kept.join(separator) : null;
}

export function formatSceneLine(scene: SceneState | null | undefined): string {
  if (!scene?.location?.trim() && !scene?.mood?.trim()) {
    return "Scène non établie";
  }
  const loc = scene.location?.trim() || "Lieu inconnu";
  const mood = scene.mood?.trim();
  const when = getSceneWhenDisplayLabel(scene, mood, ", ");
  const bits = [loc, when, mood || null].filter(Boolean);
  return bits.join(" — ");
}
