import type { ChatMessage, Player } from "../types.js";

/** Fenêtre de messages récents pour le mode « dialogue entre joueurs ». */
export const PLAYER_DIALOGUE_RECENT_WINDOW = 3;

/** Minimum de PJ humains prêts et introduits pour considérer un échange entre joueurs. */
export const PLAYER_BANTER_MIN_READY_HUMANS = 2;

const RESOLUTION_KEYWORDS_RE =
  /\b(j'?attaque|attaque[rz]?|je frappe|frappe[rz]?|je lance|lance[rz]? un|jet (de |d')|d20|d12|d10|d8|d6|d4|\bd[eé]s?\b|combat|tir[eé]?[rz]?|esquive|parade|sort\b|incant|je (bois|bu|utilise|use)|pi[eè]ge|blessure|d[eé]g[aâ]ts|initiative|roll)\b/iu;

const MJ_MENTION_RE = /@\s*mj\b|(?:^|[\s,;:])mj(?:[\s,;:!?]|$)/iu;
const MJ_TITLE_RE = /\bma[iî]tre du jeu\b/iu;

/** Question adressée au monde / au MJ plutôt qu'à un autre PJ. */
const WORLD_QUESTION_RE =
  /\b(qu[''']?est-ce que (?:je |on )?(?:vois|entends|sais|dois)|que (?:vois|entends|se passe)|y a-t-il|est-ce que (?:la|le|un[e]?|des)\b|combien de|où (?:est|se trouve)|que fait(?:-| )il|qu[''']observe)\b/iu;

/** « On est où ? » — orientation table, pas une parole pour les PNJ.
 *  Pas de `\\b` après « où » : en JS, ù n'est pas un caractère de mot. */
export const TABLE_ORIENTATION_RE =
  /on est où|où est[- ]on|où sommes[- ]nous|on en est où|c['']est où|où ça|on se trouve où|where are we|quel est cet endroit/iu;

const TABLE_IDENTITY_RE =
  /qui (suis|es)[- ]je|quels? sont mes (hommes|gens|compagnons)|où sont mes (hommes|gens)|je suis sergent|quel est mon (but|r[oô]le|rang)|qui a monté (cette|la) tente|si j['’]ai des compagnons/iu;

export function messageAsksTableOrientation(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (TABLE_ORIENTATION_RE.test(t)) return true;
  if (TABLE_IDENTITY_RE.test(t)) return true;
  if (/\?/.test(t) && /où/i.test(t) && /\b(?:on|nous|je|suis|sommes)\b/i.test(t)) {
    return true;
  }
  if (/\?/.test(t) && /\b(mes hommes|mon rang|mon but|compagnons)\b/iu.test(t)) {
    return true;
  }
  return false;
}

/** Le joueur recadre l'ampleur (« je n'ai parlé que de culture ») — pas une prise de pouvoir. */
export function messageLooksLikeScaleCorrection(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (/\bje n['’]ai (parlé|parler|fait) que\b/iu.test(t)) return true;
  if (/\bje donne juste\b/iu.test(t)) return true;
  if (/\bc['’]est juste des? (infos?|conseils?)\b/iu.test(t)) return true;
  if (/^wow\b/iu.test(t) && /\bje n['’]ai\b/iu.test(t)) return true;
  return false;
}

/** Offre un verre / retour au métier de servir. */
export function messageOffersARound(content: string): boolean {
  return /\b(quelqu['’]un veu[tx] (à )?boire|vous voulez (un verre|à boire)|qui veu[tx] (un verre|à boire)|je sers)\b/iu.test(
    content
  );
}

/** Consignes MJ quand le PJ recadre ou sert à boire. */
export function mjPlayerIntentHints(speech: string): string {
  const bits: string[] = [];
  if (messageLooksLikeScaleCorrection(speech)) {
    bits.push(
      `- Le PJ **recadre l'ampleur** : il n'a pas pris la tête du village. Tu **réduis**. Retour au quotidien. Interdit de le sacrer chef. Interdit le méta (« le seul PJ présent », « quelles actions »).`
    );
  }
  if (messageOffersARound(speech)) {
    bits.push(
      `- Il propose à boire / sert : **oui, et** — un visage connu a soif. Tu ne sors pas un menu de quête.`
    );
  }
  return bits.length ? `${bits.join("\n")}\n` : "";
}

export type PlayerBanterPlayer = Pick<
  Player,
  "id" | "kind" | "characterStatus" | "introducedInStory"
>;

export type PlayerBanterContext = {
  players: PlayerBanterPlayer[];
  /** Messages récents du salon (ordre chronologique), incluant le message courant. */
  recentMessages: Pick<ChatMessage, "kind" | "playerId" | "content">[];
  /** PNJ / marionnettes apostrophés avec @ — pas du banter PJ. */
  addressedNpcNames?: string[];
};

export function countReadyIntroducedHumans(players: PlayerBanterPlayer[]): number {
  return players.filter(
    (p) =>
      p.kind === "human" &&
      p.characterStatus === "ready" &&
      p.introducedInStory
  ).length;
}

/** Sollicitation explicite du MJ dans le texte. */
export function messageAddressesMjOrWorld(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (MJ_MENTION_RE.test(t) || MJ_TITLE_RE.test(t)) return true;
  if (messageAsksTableOrientation(t)) return true;
  if (WORLD_QUESTION_RE.test(t)) return true;
  if (/\?/.test(t)) {
    const pcDirected =
      /\b(tu |vous |t['']|vous,|dis-moi|penses-tu|crois-tu|qu['']en penses)\b/iu.test(t);
    if (pcDirected && !WORLD_QUESTION_RE.test(t)) return false;
    if (!pcDirected) return true;
  }
  return false;
}

/** Gestes ou mots-clés qui demandent une résolution MJ. */
export function messageDemandsMjResolution(content: string, kind: string): boolean {
  if (kind === "action") return true;
  const t = content.trim();
  if (!t) return false;
  return RESOLUTION_KEYWORDS_RE.test(t);
}

/**
 * Les N derniers messages « de table » (say/chat/action/mj) sont uniquement des paroles PJ,
 * sans intervention MJ — signe d'un échange entre joueurs.
 */
export function isPlayerDialogueMode(
  messages: Pick<ChatMessage, "kind" | "playerId" | "content">[],
  window = PLAYER_DIALOGUE_RECENT_WINDOW
): boolean {
  const conversational = messages.filter(
    (m) => m.kind === "say" || m.kind === "chat" || m.kind === "action" || m.kind === "mj"
  );
  const tail = conversational.slice(-window);
  if (tail.length < 2) return false;
  return tail.every((m) => m.kind === "say" || m.kind === "chat");
}

/**
 * Banter entre PJ : pas de tour MJ auto (Réclamer / indice / action / @MJ restent actifs).
 */
export function shouldSkipAutoMjForPlayerBanter(
  content: string,
  kind: string,
  _player: Pick<Player, "id" | "kind">,
  ctx: PlayerBanterContext
): boolean {
  if (kind !== "say" && kind !== "chat") return false;

  const trimmed = content.trim();
  if (!trimmed) return true;

  if (ctx.addressedNpcNames?.some((n) => n.trim())) return false;
  if (messageAddressesMjOrWorld(trimmed)) return false;
  if (messageDemandsMjResolution(trimmed, kind)) return false;

  if (countReadyIntroducedHumans(ctx.players) < PLAYER_BANTER_MIN_READY_HUMANS) {
    return false;
  }

  if (!isPlayerDialogueMode(ctx.recentMessages)) return false;

  return true;
}

/** Prompt court si un tour auto banter était quand même planifié (préférer le skip). */
export function buildPlayerBanterAckPrompt(playerName: string, content: string): string {
  return (
    `[DIALOGUE ENTRE JOUEURS] ${playerName} échange avec les autres PJ : « ${content.slice(0, 400)} »\n\n` +
    "Ne narre pas cette conversation. Au plus une réplique brève (1–2 phrases) si un indice, un danger ou une emphase est vraiment nécessaire ; sinon reste silencieux."
  );
}
