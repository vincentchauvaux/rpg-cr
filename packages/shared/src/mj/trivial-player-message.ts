/** Accusés de réception courts — pas de tour MJ automatique. */
const TRIVIAL_ACK_WORDS = new Set([
  "bien",
  "ok",
  "okay",
  "oui",
  "non",
  "merci",
  "ouais",
  "nan",
  "nop",
  "nope",
  "yep",
  "yeah",
  "yes",
  "no",
  "thanks",
  "thx",
  "dac",
  "dacc",
  "daccord",
  "dacord",
  "+",
  "+1",
  "👍",
  "👌",
  "✓",
  "✔",
  "🙏",
  "👋",
  "🙂",
  "😊",
  "👍🏻",
  "👍🏼",
  "👍🏽",
  "👍🏾",
  "👍🏿",
]);

const EMOJI_ONLY_RE = /^[\s\p{Extended_Pictographic}\uFE0F\u200D]+$/u;

/** Normalise pour comparaison (accents, ponctuation, préfixe « : »). */
export function normalizeTrivialPlayerMessage(content: string): string {
  let s = content.trim();
  s = s.replace(/^[:;,\-–—\s]+/u, "").trim();
  s = s.replace(/[!?.…,;:]+$/gu, "").trim();
  s = s.toLowerCase();
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Message joueur qui n'avance pas l'histoire (ok, bien, merci, emoji seul, etc.).
 * Ne pas confondre avec les sollicitations explicites (Réclamer, indice, préambule).
 */
export function isTrivialPlayerMessage(content: string): boolean {
  const raw = content.trim();
  if (!raw) return true;
  if (raw.length > 48) return false;

  if (EMOJI_ONLY_RE.test(raw) && raw.length <= 12) return true;

  const normalized = normalizeTrivialPlayerMessage(raw);
  if (!normalized) return true;
  if (TRIVIAL_ACK_WORDS.has(normalized)) return true;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.length <= 3 && words.every((w) => TRIVIAL_ACK_WORDS.has(w))) {
    return true;
  }

  return false;
}
