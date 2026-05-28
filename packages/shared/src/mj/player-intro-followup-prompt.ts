/** Salutations courtes — le MJ ne doit pas voler la présentation. */
const BRIEF_GREETING_RE =
  /^\s*(salut|bonjour|bonsoir|hey|hello|hi|coucou|yo|hola|allo)\s*[!?.…]*\s*$/iu;

export function isBriefPlayerGreeting(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (trimmed.length <= 12) return true;
  if (trimmed.length > 48) return false;
  return BRIEF_GREETING_RE.test(trimmed);
}

export type PlayerIntroFollowUpMode = "manual" | "auto";

import { buildNarrationPrompt } from "./narration/index.js";

export function buildPlayerIntroFollowUpPrompt(
  playerName: string,
  content: string,
  mode: PlayerIntroFollowUpMode
): string {
  const quoted = content.trim();
  const brief = isBriefPlayerGreeting(quoted);

  return buildNarrationPrompt({
    kind: mode === "manual" ? "player_intro_manual" : "player_intro_auto",
    playerName,
    actionText: quoted,
    isBriefGreeting: brief,
  });
}
