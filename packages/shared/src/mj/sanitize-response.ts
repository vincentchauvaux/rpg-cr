/**
 * Retire le raisonnement interne des modèles (Gemma, Qwen, etc.) des réponses MJ affichées au chat.
 *
 * Cas testés :
 * - « Le vent souffle…\n\nThinking Process: 1. **Analyze the Request:**… » → paragraphes français seuls
 * - « Récit…\n\n**Review Current Context:** … » → récit seul
 * - Balises think / redacted_reasoning → contenu hors balises
 */

/** Marqueurs où commence le contenu interne (première occurrence = coupure). */
const MJ_LEAK_MARKERS: RegExp[] = [
  /\bThinking Process\s*:/i,
  /\bFinal Output Generation\b/i,
  /\bChain of Thought\s*:/i,
  /\bReasoning Process\s*:/i,
  /\*\*Analyze the Request:\*\*/i,
  /\*\*Review(?: the)? Current Context:\*\*/i,
  /\*\*Consider(?:ation)?(?:s)?:\*\*/i,
  /\*\*Draft(?:ing)?(?: Output)?:\*\*/i,
  /\*\*Plan(?:ning)?:\*\*/i,
  /\*\*Step \d+\s*[-–—:]?\*\*/i,
  /(?:^|\n)\d+\.\s*\*\*(?:Analyze|Review|Consider|Draft|Plan|Final|Output|Generate)/im,
  /(?:^|\n)#{1,3}\s*Thinking\b/im,
  /(?:^|\n)Analysis\s*:/im,
];

const THINK_OPEN = "<" + "think" + ">";
const THINK_CLOSE = "<" + "/" + "think" + ">";
const REASONING_OPEN = "<" + "redacted_reasoning" + ">";
const REASONING_CLOSE = "<" + "/" + "redacted_reasoning" + ">";
const THINK_TAG_PATTERNS = [
  new RegExp(THINK_OPEN + "[\\s\\S]*?" + THINK_CLOSE, "gi"),
  new RegExp(REASONING_OPEN + "[\\s\\S]*?" + REASONING_CLOSE, "gi"),
];

/** Minimum de caractères narratifs avant une coupure (évite de tout effacer si leak-only). */
const MIN_NARRATIVE_BEFORE_CUT = 20;

function stripThinkTags(text: string): string {
  let out = text;
  for (const re of THINK_TAG_PATTERNS) {
    out = out.replace(re, "");
  }
  return out.trim();
}

function earliestLeakIndex(text: string): number {
  let earliest = -1;
  for (const re of MJ_LEAK_MARKERS) {
    const m = re.exec(text);
    if (m && m.index >= 0) {
      if (earliest === -1 || m.index < earliest) earliest = m.index;
    }
  }
  return earliest;
}

/** Coupe les boucles de fin (« Il reste. Il reste. … ») sur petits modèles. */
export function collapseTrailingPhraseLoop(text: string): string {
  let out = text.trim();
  if (!out) return out;

  const clause =
    "([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\\s''\\-—]{1,55}?)([.…!?])";
  const loopStart = new RegExp(`^${clause}\\s*(?:\\1\\2\\s*){3,}`, "u");
  const loopTail = new RegExp(`(${clause})(?:\\s*\\1\\2){4,}\\s*$`, "u");

  const paragraphs = out.split(/\n\n+/);
  const lastIdx = paragraphs.length - 1;
  const last = paragraphs[lastIdx]?.trim() ?? "";
  const startMatch = last.match(loopStart);
  if (startMatch) {
    paragraphs[lastIdx] = `${startMatch[1].trim()}${startMatch[2]}`;
    return paragraphs.join("\n\n").trim();
  }

  const tailMatch = out.match(loopTail);
  if (
    tailMatch &&
    tailMatch.index != null &&
    tailMatch.index >= MIN_NARRATIVE_BEFORE_CUT
  ) {
    const end = tailMatch.index + tailMatch[1].length + tailMatch[2].length;
    out = out.slice(0, end).trim();
  }

  return out;
}

function trimTrailingLeakBlock(text: string): string {
  const trailing = text.match(
    /\n{2,}(?:\d+\.\s*\*\*(?:Analyze|Review|Consider|Draft|Plan|Final)[\s\S]*)$/i
  );
  if (trailing && trailing.index != null && trailing.index >= MIN_NARRATIVE_BEFORE_CUT) {
    return text.slice(0, trailing.index).trim();
  }
  return text;
}

export function sanitizeMjResponse(text: string): string {
  if (!text?.trim()) return "";

  let out = stripThinkTags(text.trim());

  const leakAt = earliestLeakIndex(out);
  if (leakAt >= MIN_NARRATIVE_BEFORE_CUT) {
    out = out.slice(0, leakAt).trim();
  } else if (leakAt >= 0 && leakAt < MIN_NARRATIVE_BEFORE_CUT) {
    const afterLeak = out.slice(leakAt);
    if (MJ_LEAK_MARKERS.some((re) => re.test(afterLeak.slice(0, 120)))) {
      out = "";
    }
  }

  out = trimTrailingLeakBlock(out);
  out = collapseTrailingPhraseLoop(out);

  return out.replace(/\n{3,}/g, "\n\n").trim();
}
