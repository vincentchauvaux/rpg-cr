import type { CharacterSheet, Player } from "./types.js";

/** Posture d'un compagnon de route (évolue en jeu). */
export type CompanionStance = "ally" | "wary" | "hostile";

export type CompanionPactAction = "recruit" | "leave" | "betray";

/** Bloc MJ `<!--companion:{…}-->` — jamais affiché aux joueurs. */
export interface CompanionDirective {
  action: CompanionPactAction;
  name: string;
  personality?: string;
  bond?: string;
  agenda?: string;
  loyalty?: number;
  reason?: string;
  /** Trahison + départ (ennemi ouvert) ; sinon le compagnon reste pour saboter. */
  depart?: boolean;
}

const STANCES = new Set<CompanionStance>(["ally", "wary", "hostile"]);

/** Invitation in-fiction à voyager / rejoindre la quête. */
export const COMPANION_INVITE_RE =
  /\b(viens(?:-tu)?(?:\s+avec|\s*-t['']en)?|accompagne(?:[- ](?:moi|nous))?|rejoins(?:[- ](?:moi|nous|la\s+bande))?|suis[- ](?:moi|nous)|pars?\s+avec|partir\s+avec|voyage(?:r)?\s+avec|fais(?:ons)?\s+route|en\s+qu[eê]te\s+avec|dans\s+(?:ma|notre)\s+qu[eê]te|avec\s+nous\s+(?:dans|pour|sur)|embauch|recrut|pr[eê]te[- ]moi\s+(?:ton|tes)|dans\s+le\s+groupe|dans\s+la\s+compagnie)\b/i;

export function messageLooksLikeCompanionInvite(text: string): boolean {
  return COMPANION_INVITE_RE.test(text.trim());
}

export function clampCompanionLoyalty(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(-100, Math.round(n)));
}

export function normalizeCompanionStance(
  raw: unknown
): CompanionStance | undefined {
  const s = String(raw ?? "").trim().toLowerCase();
  if (STANCES.has(s as CompanionStance)) return s as CompanionStance;
  return undefined;
}

export function companionStanceFromLoyalty(
  loyalty: number | undefined
): CompanionStance {
  if (loyalty == null) return "ally";
  if (loyalty <= -20) return "hostile";
  if (loyalty < 35) return "wary";
  return "ally";
}

export function resolveCompanionStance(sheet: CharacterSheet): CompanionStance {
  return (
    normalizeCompanionStance(sheet.companionStance) ??
    companionStanceFromLoyalty(sheet.companionLoyalty)
  );
}

export function formatCompanionLoyaltyHint(sheet: CharacterSheet): string {
  const stance = resolveCompanionStance(sheet);
  const n = sheet.companionLoyalty;
  const label =
    stance === "hostile"
      ? "hostile"
      : stance === "wary"
        ? "méfiant"
        : "allié";
  return n == null ? label : `${label} (${n})`;
}

export function isQuestCompanionSheet(sheet: CharacterSheet): boolean {
  return Boolean(
    sheet.personality?.trim() ||
      sheet.companionBond?.trim() ||
      sheet.companionAgenda?.trim() ||
      sheet.companionLoyalty != null ||
      sheet.companionStance
  );
}

/** Marionnette recrutée in-fiction (pas seulement ajout admin). */
export function isQuestCompanion(player: Player): boolean {
  if (player.kind !== "ai_puppet") return false;
  return isQuestCompanionSheet(player.characterSheet);
}

export function formatCompanionRosterForMj(players: Player[]): string {
  const active = players.filter(
    (p) => p.kind === "ai_puppet" && p.circleStatus === "active"
  );
  if (!active.length) return "";
  return active.map((p) => `- ${formatCompanionBriefForMj(p)}`).join("\n");
}

export function formatCompanionBriefForMj(player: Player): string {
  const s = player.characterSheet;
  const bits = [`**${player.name}**`];
  if (s.personality?.trim()) bits.push(`caractère : ${s.personality.trim()}`);
  if (s.companionBond?.trim()) bits.push(`lien : ${s.companionBond.trim()}`);
  if (s.companionAgenda?.trim()) {
    bits.push(`agenda (secret MJ) : ${s.companionAgenda.trim()}`);
  }
  if (isQuestCompanionSheet(s) || player.kind === "ai_puppet") {
    bits.push(`loyauté : ${formatCompanionLoyaltyHint(s)}`);
  }
  return bits.join(" — ");
}

export function matchNamedAiPlayer<T extends { name: string; kind: string }>(
  players: T[],
  rawName: string
): T | null {
  const needle = rawName.trim().toLowerCase();
  if (!needle) return null;
  const puppets = players.filter((p) => p.kind === "ai_puppet");
  const exact = puppets.filter((p) => p.name.trim().toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact[0];
  const starts = puppets.filter((p) =>
    p.name.trim().toLowerCase().startsWith(needle)
  );
  if (starts.length === 1) return starts[0];
  const includes = puppets.filter((p) =>
    p.name.trim().toLowerCase().includes(needle)
  );
  if (includes.length === 1) return includes[0];
  return null;
}

function asTrimmedString(value: unknown): string | undefined {
  const t = String(value ?? "").trim();
  return t || undefined;
}

export function parseCompanionDirective(raw: unknown): CompanionDirective | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const actionRaw = String(o.action ?? "").trim().toLowerCase();
  const action: CompanionPactAction | null =
    actionRaw === "recruit" || actionRaw === "join"
      ? "recruit"
      : actionRaw === "leave" || actionRaw === "depart" || actionRaw === "quit"
        ? "leave"
        : actionRaw === "betray" || actionRaw === "traitor"
          ? "betray"
          : null;
  const name = asTrimmedString(o.name) ?? asTrimmedString(o.npc);
  if (!action || !name) return null;
  const departRaw = o.depart;
  const depart =
    departRaw === true ||
    String(departRaw ?? "").toLowerCase() === "true" ||
    actionRaw === "depart";
  return {
    action,
    name,
    personality: asTrimmedString(o.personality) ?? asTrimmedString(o.character),
    bond: asTrimmedString(o.bond) ?? asTrimmedString(o.companionBond),
    agenda: asTrimmedString(o.agenda) ?? asTrimmedString(o.companionAgenda),
    loyalty: clampCompanionLoyalty(o.loyalty),
    reason: asTrimmedString(o.reason),
    ...(depart ? { depart: true } : {}),
  };
}

export const MJ_COMPANION_PACT_RULES = `## Compagnons de route (PNJ)
- Un PJ peut **demander in-fiction** à un PNJ de l'accompagner (quête, voyage, bande). Pas de bouton magique : c'est du jeu de rôle.
- Le PNJ a un **caractère propre** (comique, sinistre, mystérieux, gourmand, honorable, lâche, vaniteux…). Il n'est pas un familier obéissant.
- **Refus** : narre le refus (peur, affaire ailleurs, mépris, prix trop haut). N'ajoute **aucun** bloc.
- **Acceptation** : narre l'accord **et** ajoute en fin de message (invisible) :
  \`<!--companion:{"action":"recruit","name":"Nom","personality":"trait de caractère","bond":"pourquoi iel suit","agenda":"but secret ou parallèle","loyalty":40}-->\`
  \`loyalty\` de −100 (ennemi) à +100 (dévoué). Un nouvel allié typique : 25–55.
- **Départ de son chef** (but divergé, ennui, danger, dette ailleurs) : narre le départ **et** \`<!--companion:{"action":"leave","name":"Nom","reason":"…"}-->\`.
- **Trahison** (mauvaise intention, désaccord fort, alignement, agenda) : narre le coup **et** \`<!--companion:{"action":"betray","name":"Nom","reason":"…"}-->\`. Iel **reste** dans le cercle pour saboter, sauf si tu ajoutes \`"depart":true\` (ennemi ouvert qui s'en va).
- Un seul bloc par PNJ concerné, JSON sur une ligne, balise fermée. Jamais visible dans le récit.
- N'invente pas de recrutement sans invitation claire du PJ (ou sans que le PNJ propose lui-même d'accompagner, et que le PJ accepte).`;

export const MJ_COMPANION_PACT_RULES_COMPACT = `- Invitation in-fiction à un PNJ : iel peut refuser, ou accepter via \`<!--companion:{"action":"recruit","name","personality","bond","agenda","loyalty"}-->\`. Départ : \`leave\`. Trahison : \`betray\` (\`"depart":true\` s'il s'en va). Caractère propre, pas un familier.`;

export const COMPANION_INVITE_MJ_HINT =
  "\n- Le joueur **propose** à ce PNJ de l'accompagner. Le PNJ décide selon son caractère, ses intérêts et la scène — **pas** d'obligation d'accepter. Refus = récit seulement. Accord = récit **et** bloc `<!--companion:{\"action\":\"recruit\",…}-->` (voir consignes compagnons).\n";

export const COMPANION_ONGOING_MJ_HINT =
  "\n- Les **compagnons de route** ont un caractère et un agenda : s'ils n'ont plus intérêt à suivre, ou s'ils désapprouvent, ils peuvent partir (`leave`) ou trahir (`betray`) — narre d'abord, bloc ensuite.\n";
