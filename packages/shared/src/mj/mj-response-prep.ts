import type { ScenePatchInput } from "./scene-extract-prompt.js";
import { parseExtractedScene } from "./scene-extract-prompt.js";
import { sanitizeMjResponse } from "./sanitize-response.js";
import type { ExtractedNarrativeArc } from "./narrative-arc-extract-prompt.js";
import {
  parseCompanionDirective,
  type CompanionDirective,
} from "../companion-pact.js";

/** Blocs métadonnées MJ fermés (`<!--scene:…-->` / `<!--arc:…-->` / `<!--companion:…-->`). */
const SCENE_BLOCK_RE = /<!--\s*scene:\s*([\s\S]*?)\s*-->/gi;
const ARC_BLOCK_RE = /<!--\s*arc:\s*([\s\S]*?)\s*-->/gi;
const COMPANION_BLOCK_RE = /<!--\s*companion:\s*([\s\S]*?)\s*-->/gi;
/** Fuite en fin de message : balise ouverte sans `-->` de fermeture. */
const SCENE_TAIL_RE = /<!--\s*scene:(?![\s\S]*-->)[\s\S]*$/gi;
const ARC_TAIL_RE = /<!--\s*arc:(?![\s\S]*-->)[\s\S]*$/gi;
const COMPANION_TAIL_RE = /<!--\s*companion:(?![\s\S]*-->)[\s\S]*$/gi;
/** Variante sans délimiteurs HTML (fuite modèle). */
const BARE_SCENE_BLOCK_RE =
  /(?:^|\n)\s*(?:\*\*)?\s*\[MJ\]\s*(?:\*\*)?\s*<!--?\s*scene:\s*([\s\S]*?)\s*(?:-->)?\s*(?=\n|$)/gi;
const BARE_ARC_BLOCK_RE =
  /(?:^|\n)\s*<!--?\s*arc:\s*([\s\S]*?)\s*(?:-->)?\s*(?=\n|$)/gi;
const BARE_COMPANION_BLOCK_RE =
  /(?:^|\n)\s*<!--?\s*companion:\s*([\s\S]*?)\s*(?:-->)?\s*(?=\n|$)/gi;
/** Tag « voix joueur » (format historique chat) — ne doit pas apparaître dans le récit MJ. */
const VJ_TAG_RE = /\[VJ\]\s*/gi;

/** Écho du format « derniers échanges » injecté dans la réponse. */
const CHAT_ROLE_PREFIX_RE =
  /^\*{0,2}\s*\[(?:MJ|ACTION|DIRE|VJ)\]\s*\*{0,2}\s*/im;

export interface PreparedMjResponse {
  content: string;
  scenePatch: ScenePatchInput | null;
  arcPatch: ExtractedNarrativeArc | null;
  companionDirectives: CompanionDirective[];
}

/** Extrait le premier objet JSON d'un bloc arc/scene (évite `*?` qui s'arrête au premier `}` dans une chaîne). */
function firstJsonObjectLiteral(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function parseArcCommentObject(raw: string): ExtractedNarrativeArc | null {
  const json = firstJsonObjectLiteral(raw.trim()) ?? raw.trim();
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
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

function extractSceneFromBlock(inner: string): ScenePatchInput | null {
  const json = firstJsonObjectLiteral(inner) ?? inner.trim();
  const parsed = parseExtractedScene(json);
  if (!parsed || parsed.unchanged) return null;
  return parsed;
}

function stripLeakedMetadataTails(text: string): string {
  return text
    .replace(SCENE_TAIL_RE, "")
    .replace(ARC_TAIL_RE, "")
    .replace(COMPANION_TAIL_RE, "")
    .replace(/(?:^|\n)\s*<!--?\s*(?:scene|arc|companion):\s*[\s\S]*$/gim, "")
    .trim();
}

function parseCompanionCommentObject(raw: string): CompanionDirective | null {
  const json = firstJsonObjectLiteral(raw.trim()) ?? raw.trim();
  try {
    return parseCompanionDirective(JSON.parse(json) as unknown);
  } catch {
    return parseCompanionDirective(raw);
  }
}

function stripCompanionComments(text: string): {
  cleaned: string;
  directives: CompanionDirective[];
} {
  const directives: CompanionDirective[] = [];
  const patterns = [COMPANION_BLOCK_RE, BARE_COMPANION_BLOCK_RE];
  let cleaned = text;
  for (const re of patterns) {
    cleaned = cleaned.replace(re, (_, inner: string) => {
      const parsed = parseCompanionCommentObject(inner);
      if (parsed) directives.push(parsed);
      return "";
    });
  }
  return { cleaned: cleaned.trim(), directives };
}

function stripSceneComments(text: string): { cleaned: string; scene: ScenePatchInput | null } {
  let scene: ScenePatchInput | null = null;
  const patterns = [SCENE_BLOCK_RE, BARE_SCENE_BLOCK_RE];
  let cleaned = text;
  for (const re of patterns) {
    cleaned = cleaned.replace(re, (_, inner: string) => {
      const parsed = extractSceneFromBlock(inner);
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
  const patterns = [ARC_BLOCK_RE, BARE_ARC_BLOCK_RE];
  let cleaned = text;
  for (const re of patterns) {
    cleaned = cleaned.replace(re, (_, inner: string) => {
      const parsed = parseArcCommentObject(inner);
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
  const companionPass = stripCompanionComments(arcPass.cleaned);
  return stripChatRoleEcho(stripLeakedMetadataTails(companionPass.cleaned));
}

/** Texte MJ affiché au chat (métadonnées + raisonnement interne + fuites [VJ]). */
export function formatMjMessageForDisplay(raw: string): string {
  const meta = stripMjMetadataComments(raw);
  const vj = transformVjSegmentsForDisplay(meta);
  return sanitizeMjResponse(vj);
}

/** Retire les blocs `<!--scene:…-->` / `<!--arc:…-->` / `<!--companion:…-->` et sanitize le récit joueur. */
export function prepareMjResponse(raw: string): PreparedMjResponse {
  const scenePass = stripSceneComments(raw);
  const arcPass = stripArcComments(scenePass.cleaned);
  const companionPass = stripCompanionComments(arcPass.cleaned);
  const vjCleaned = transformVjSegmentsForDisplay(companionPass.cleaned);
  return {
    content: sanitizeMjResponse(
      stripChatRoleEcho(stripLeakedMetadataTails(vjCleaned))
    ),
    scenePatch: scenePass.scene,
    arcPatch: arcPass.arc,
    companionDirectives: companionPass.directives,
  };
}
