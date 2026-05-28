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

  return out.replace(/\n{3,}/g, "\n\n").trim();
}
