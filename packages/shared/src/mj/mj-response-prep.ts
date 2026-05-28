import type { ScenePatchInput } from "./scene-extract-prompt.js";
import { parseExtractedScene } from "./scene-extract-prompt.js";
import { sanitizeMjResponse } from "./sanitize-response.js";
import type { ExtractedNarrativeArc } from "./narrative-arc-extract-prompt.js";

/** Bloc HTML `<!--scene:{…}-->` (fermé ou tronqué en fin de message). */
const SCENE_COMMENT_RE =
  /<!--\s*scene:\s*(\{[\s\S]*?\})\s*(?:-->|(?=\s*$))/gi;
const ARC_COMMENT_RE =
  /<!--\s*arc:\s*(\{[\s\S]*?\})\s*(?:-->|(?=\s*$))/gi;
/** Variante sans délimiteurs HTML (fuite modèle). */
const BARE_SCENE_JSON_RE =
  /(?:^|\n)\s*(?:\*\*)?\s*\[MJ\]\s*(?:\*\*)?\s*<!--?\s*scene:\s*(\{[\s\S]*?\})\s*(?:-->)?\s*(?=\n|$)/gi;
const BARE_ARC_JSON_RE =
  /(?:^|\n)\s*<!--?\s*arc:\s*(\{[\s\S]*?\})\s*(?:-->)?\s*(?=\n|$)/gi;
/** Tag « voix joueur » (format historique chat) — ne doit pas apparaître dans le récit MJ. */
const VJ_TAG_RE = /\[VJ\]\s*/gi;

/** Écho du format « derniers échanges » injecté dans la réponse. */
const CHAT_ROLE_PREFIX_RE =
  /^\*{0,2}\s*\[(?:MJ|ACTION|DIRE|VJ)\]\s*\*{0,2}\s*/im;

export interface PreparedMjResponse {
  content: string;
  scenePatch: ScenePatchInput | null;
  arcPatch: ExtractedNarrativeArc | null;
}

function parseArcCommentObject(raw: string): ExtractedNarrativeArc | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
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

function extractSceneFromJsonMatch(json: string): ScenePatchInput | null {
  const parsed = parseExtractedScene(json);
  if (!parsed || parsed.unchanged) return null;
  return parsed;
}

function stripSceneComments(text: string): { cleaned: string; scene: ScenePatchInput | null } {
  let scene: ScenePatchInput | null = null;
  const patterns = [SCENE_COMMENT_RE, BARE_SCENE_JSON_RE];
  let cleaned = text;
  for (const re of patterns) {
    cleaned = cleaned.replace(re, (_, json: string) => {
      const parsed = extractSceneFromJsonMatch(json);
      if (parsed) scene = parsed;
      return "";
    });
  }
  return { cleaned: cleaned.trim(), scene };
}

function stripArcComments(text: string): {
  cleaned: string;
  arc: ExtractedNarrativeArc | null;
} {
  let arc: PreparedMjResponse["arcPatch"] = null;
  const patterns = [ARC_COMMENT_RE, BARE_ARC_JSON_RE];
  let cleaned = text;
  for (const re of patterns) {
    cleaned = cleaned.replace(re, (_, json: string) => {
      const parsed = parseArcCommentObject(json);
      if (parsed) arc = parsed;
      return "";
    });
  }
  return { cleaned: cleaned.trim(), arc };
}

function stripChatRoleEcho(text: string): string {
  return text.replace(CHAT_ROLE_PREFIX_RE, "").trim();
}

/**
 * Segments `[VJ]…` → citations markdown (voix PJ hors tour MJ).
 * Nettoyage rétroactif si le modèle confond avec le format salon.
 */
export function transformVjSegmentsForDisplay(text: string): string {
  if (!/\[VJ\]/i.test(text)) {
    return text.replace(VJ_TAG_RE, "").trim();
  }
  const chunks = text.split(VJ_TAG_RE);
  const head = chunks[0]?.trim() ?? "";
  const blocks: string[] = head ? [head] : [];
  for (let i = 1; i < chunks.length; i++) {
    const seg = chunks[i]?.trim();
    if (!seg) continue;
    const inner = seg.replace(/«([^»]+)»/g, (_, line: string) => `*«${line.trim()}»*`);
    blocks.push(`> *${inner}*`);
  }
  return blocks.join("\n\n").trim();
}

/** Retire métadonnées scène/trame sans sanitize (extraction serveur). */
export function stripMjMetadataComments(raw: string): string {
  const scenePass = stripSceneComments(raw);
  const arcPass = stripArcComments(scenePass.cleaned);
  return stripChatRoleEcho(arcPass.cleaned);
}

/** Texte MJ affiché au chat (métadonnées + raisonnement interne + fuites [VJ]). */
export function formatMjMessageForDisplay(raw: string): string {
  const meta = stripMjMetadataComments(raw);
  const vj = transformVjSegmentsForDisplay(meta);
  return sanitizeMjResponse(vj);
}

/** Retire les blocs `<!--scene:…-->` / `<!--arc:…-->` et sanitize le récit joueur. */
export function prepareMjResponse(raw: string): PreparedMjResponse {
  const scenePass = stripSceneComments(raw);
  const arcPass = stripArcComments(scenePass.cleaned);
  const vjCleaned = transformVjSegmentsForDisplay(arcPass.cleaned);
  return {
    content: sanitizeMjResponse(stripChatRoleEcho(vjCleaned)),
    scenePatch: scenePass.scene,
    arcPatch: arcPass.arc,
  };
}
