import { randomUUID } from "node:crypto";
import type { CharacterSheet, Player, SceneCheckPublic, StatKey } from "@rpg-cr/shared";
import {
  STAT_LABELS,
  canHumanParticipateInChat,
  extractMjChoices,
  formatSceneCheckActionMessage,
  formatSceneChoiceRoundActionMessage,
  helpAbilityFor,
  helperGrantsAdvantage,
  inferSceneCheck,
  isSceneCheckActionContent,
  matchChoice,
  opposeAbilityFor,
  resolveSceneCheckOutcome,
  rollAbilityCheck,
  statModifier,
  toSceneCheckPublic,
  type SceneCheckJoinStance,
  type SceneCheckPickKind,
  type SceneCheckPickPublic,
  type SceneCheckRoll,
  type SceneCheckSpec,
} from "@rpg-cr/shared";
import { getCharacter } from "./character.js";
import { listMessages, saveMessage, setAfterMessageSave } from "./messages.js";
import { scheduleActionMj } from "./mj-auto.js";
import { getSceneState } from "./room-scene.js";
import { getPlayerById, listPlayers } from "./rooms.js";
import { broadcastMessage, broadcastSceneCheck } from "./ws-hub.js";

const TABLE_WINDOW_MS = 25_000;
const SOLO_WINDOW_MS = 600;
const CONSUMED_CAP = 48;

type InternalPick = {
  playerId: string;
  playerName: string;
  kind: SceneCheckPickKind;
  choice?: string;
  spec?: SceneCheckSpec;
  ability?: StatKey;
  abilityScore?: number;
  modifier: number;
  natural: number;
  naturalAlt?: number;
  worldNatural?: number;
  worldMod?: number;
};

type InternalSceneCheck = {
  id: string;
  roomId: string;
  sourceMessageId: string;
  offeredChoices: string[];
  firstActorId: string;
  picks: InternalPick[];
  expiresAt: number;
  timeout: ReturnType<typeof setTimeout>;
  resolving: boolean;
};

const byRoom = new Map<string, InternalSceneCheck>();
const consumedByRoom = new Map<string, Set<string>>();

export class SceneCheckHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "SceneCheckHttpError";
  }
}

function abilityScoreFor(
  sheet: CharacterSheet | undefined,
  ability: StatKey
): number {
  return sheet?.stats?.[ability] ?? 10;
}

function sheetOf(playerId: string): CharacterSheet | undefined {
  return getCharacter(playerId)?.characterSheet;
}

function countReadyHumans(roomId: string): number {
  return listPlayers(roomId).filter(canHumanParticipateInChat).length;
}

function consumedSet(roomId: string): Set<string> {
  let set = consumedByRoom.get(roomId);
  if (!set) {
    set = new Set();
    consumedByRoom.set(roomId, set);
  }
  return set;
}

function consumeSource(roomId: string, messageId: string): void {
  if (!messageId) return;
  const set = consumedSet(roomId);
  set.add(messageId);
  if (set.size > CONSUMED_CAP) {
    const extra = set.size - CONSUMED_CAP;
    let dropped = 0;
    for (const id of set) {
      set.delete(id);
      dropped += 1;
      if (dropped >= extra) break;
    }
  }
}

function lastMjMessage(roomId: string) {
  const messages = listMessages(roomId, 80);
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.kind === "mj") return messages[i];
  }
  return undefined;
}

export function isChoiceSourceConsumed(roomId: string, messageId: string): boolean {
  return consumedSet(roomId).has(messageId);
}

export function getLiveChoiceMessageId(roomId: string): string | null {
  const open = byRoom.get(roomId);
  if (open && !open.resolving) return open.sourceMessageId;
  const mj = lastMjMessage(roomId);
  if (!mj) return null;
  if (consumedSet(roomId).has(mj.id)) return null;
  if (extractMjChoices(mj.content).length < 2) return null;
  return mj.id;
}

function picksToPublic(picks: InternalPick[]): SceneCheckPickPublic[] {
  return picks.map((p) => ({
    playerId: p.playerId,
    playerName: p.playerName,
    kind: p.kind,
    choice: p.choice,
    ability: p.ability,
  }));
}

function toPublic(check: InternalSceneCheck): SceneCheckPublic {
  const first =
    check.picks.find((p) => p.kind === "choice") ?? check.picks[0];
  const spec = first?.spec ?? inferSceneCheck(first?.choice ?? "", 0);
  return toSceneCheckPublic({
    id: check.id,
    roomId: check.roomId,
    sourceMessageId: check.sourceMessageId,
    choice: first?.choice ?? "",
    spec,
    actorPlayerId: first?.playerId ?? check.firstActorId,
    actorPlayerName: first?.playerName ?? "",
    actorAbilityScore: first?.abilityScore,
    actorModifier: first?.modifier,
    expiresAt: check.expiresAt,
    helpers: check.picks
      .filter((p) => p.kind === "help")
      .map((h) => ({
        playerId: h.playerId,
        playerName: h.playerName,
        ability: h.ability ?? spec.ability,
      })),
    opposers: check.picks
      .filter((p) => p.kind === "oppose")
      .map((o) => ({
        playerId: o.playerId,
        playerName: o.playerName,
        ability: o.ability ?? spec.ability,
      })),
    picks: picksToPublic(check.picks),
    offeredChoices: check.offeredChoices,
    status: "open",
  });
}

function emit(roomId: string, check: SceneCheckPublic | null): void {
  broadcastSceneCheck(roomId, check, getLiveChoiceMessageId(roomId));
}

export function getOpenSceneCheck(roomId: string): SceneCheckPublic | null {
  const check = byRoom.get(roomId);
  if (!check || check.resolving) return null;
  return toPublic(check);
}

function clearTimeoutSafe(check: InternalSceneCheck): void {
  clearTimeout(check.timeout);
}

function abandonOpenRound(roomId: string, consumeSourceId?: string): void {
  const check = byRoom.get(roomId);
  if (!check || check.resolving) {
    if (consumeSourceId) consumeSource(roomId, consumeSourceId);
    return;
  }
  check.resolving = true;
  clearTimeoutSafe(check);
  byRoom.delete(roomId);
  consumeSource(roomId, consumeSourceId ?? check.sourceMessageId);
  emit(roomId, null);
}

function alreadyPicked(check: InternalSceneCheck, playerId: string): boolean {
  return check.picks.some((p) => p.playerId === playerId);
}

function rollChoicePick(
  player: Player,
  choice: string,
  tension: number
): InternalPick {
  const spec = inferSceneCheck(choice, tension);
  const sheet = sheetOf(player.id);
  const score = abilityScoreFor(sheet, spec.ability);
  const mod = statModifier(score);
  const first = rollAbilityCheck(mod);
  const second = rollAbilityCheck(mod);
  const world = rollAbilityCheck(spec.worldMod);
  return {
    playerId: player.id,
    playerName: player.name,
    kind: "choice",
    choice,
    spec,
    ability: spec.ability,
    abilityScore: score,
    modifier: mod,
    natural: first.natural,
    naturalAlt: second.natural,
    worldNatural: world.natural,
    worldMod: spec.worldMod,
  };
}

function maybeResolveIfComplete(roomId: string, checkId: string): boolean {
  const check = byRoom.get(roomId);
  if (!check || check.id !== checkId || check.resolving) return false;
  const humans = countReadyHumans(roomId);
  if (humans <= 1) return false;
  const responded = new Set(check.picks.map((p) => p.playerId));
  if (responded.size < humans) return false;
  resolveInternal(roomId, checkId, "complete");
  return true;
}

function addPickAndMaybeResolve(
  check: InternalSceneCheck,
  pick: InternalPick
): SceneCheckPublic | null {
  check.picks.push(pick);
  const pub = toPublic(check);
  emit(check.roomId, pub);
  if (maybeResolveIfComplete(check.roomId, check.id)) return null;
  return pub;
}

export function startSceneCheck(input: {
  roomId: string;
  actorPlayerId: string;
  sourceMessageId: string;
  choice: string;
}): SceneCheckPublic | null {
  const actor = getPlayerById(input.actorPlayerId);
  if (!actor || actor.roomId !== input.roomId) {
    throw new SceneCheckHttpError(403, "Non autorisé");
  }
  if (!canHumanParticipateInChat(actor)) {
    throw new SceneCheckHttpError(403, "Présentez-vous à la table avant d'agir");
  }

  const existing = byRoom.get(input.roomId);
  if (existing && !existing.resolving) {
    if (existing.sourceMessageId !== input.sourceMessageId) {
      throw new SceneCheckHttpError(400, "Ce choix n'est plus d'actualité");
    }
    if (alreadyPicked(existing, actor.id)) {
      throw new SceneCheckHttpError(409, "Vous avez déjà choisi pour ce tour");
    }
    const choice = matchChoice(existing.offeredChoices, input.choice);
    if (!choice) {
      throw new SceneCheckHttpError(400, "Choix introuvable dans le récit du MJ");
    }
    const sameAs = existing.picks.find(
      (p) => p.kind === "choice" && p.choice && matchChoice([p.choice], choice)
    );
    const tension = getSceneState(input.roomId)?.tension ?? 0;
    if (sameAs) {
      const ability = helpAbilityFor(sameAs.spec?.ability ?? "sagesse");
      const sheet = sheetOf(actor.id);
      const abilityScore = abilityScoreFor(sheet, ability);
      const mod = statModifier(abilityScore);
      const roll = rollAbilityCheck(mod);
      return addPickAndMaybeResolve(existing, {
        playerId: actor.id,
        playerName: actor.name,
        kind: "help",
        ability,
        abilityScore,
        modifier: mod,
        natural: roll.natural,
      });
    }
    return addPickAndMaybeResolve(
      existing,
      rollChoicePick(actor, choice, tension)
    );
  }

  const mj = lastMjMessage(input.roomId);
  if (!mj || mj.id !== input.sourceMessageId) {
    throw new SceneCheckHttpError(400, "Ce choix n'est plus d'actualité");
  }
  if (consumedSet(input.roomId).has(mj.id)) {
    throw new SceneCheckHttpError(400, "Ce choix n'est plus d'actualité");
  }

  const choices = extractMjChoices(mj.content);
  const choice = matchChoice(choices, input.choice);
  if (!choice) {
    throw new SceneCheckHttpError(400, "Choix introuvable dans le récit du MJ");
  }

  const tension = getSceneState(input.roomId)?.tension ?? 0;
  const humans = countReadyHumans(input.roomId);
  const windowMs = humans <= 1 ? SOLO_WINDOW_MS : TABLE_WINDOW_MS;
  const id = randomUUID();
  const expiresAt = Date.now() + windowMs;
  const firstPick = rollChoicePick(actor, choice, tension);

  const record: InternalSceneCheck = {
    id,
    roomId: input.roomId,
    sourceMessageId: input.sourceMessageId,
    offeredChoices: choices,
    firstActorId: actor.id,
    picks: [firstPick],
    expiresAt,
    resolving: false,
    timeout: setTimeout(() => {
      resolveInternal(input.roomId, id, "timeout");
    }, windowMs),
  };

  byRoom.set(input.roomId, record);
  if (humans <= 1) {
    resolveInternal(input.roomId, id, "timeout");
    return null;
  }
  const pub = toPublic(record);
  emit(input.roomId, pub);
  return pub;
}

export function joinSceneCheck(input: {
  roomId: string;
  actorPlayerId: string;
  checkId: string;
  stance: SceneCheckJoinStance;
  choice?: string;
}): SceneCheckPublic | null {
  const player = getPlayerById(input.actorPlayerId);
  if (!player || player.roomId !== input.roomId) {
    throw new SceneCheckHttpError(403, "Non autorisé");
  }
  if (!canHumanParticipateInChat(player)) {
    throw new SceneCheckHttpError(403, "Présentez-vous à la table avant d'agir");
  }

  const check = byRoom.get(input.roomId);
  if (!check || check.resolving || check.id !== input.checkId) {
    throw new SceneCheckHttpError(404, "Aucune épreuve en cours");
  }
  if (alreadyPicked(check, player.id)) {
    throw new SceneCheckHttpError(409, "Vous avez déjà choisi pour ce tour");
  }

  if (input.stance === "choice") {
    return startSceneCheck({
      roomId: input.roomId,
      actorPlayerId: player.id,
      sourceMessageId: check.sourceMessageId,
      choice: input.choice ?? "",
    });
  }

  if (input.stance === "pass") {
    return addPickAndMaybeResolve(check, {
      playerId: player.id,
      playerName: player.name,
      kind: "pass",
      modifier: 0,
      natural: 0,
    });
  }

  const lead = check.picks.find((p) => p.kind === "choice");
  const leadAbility = lead?.spec?.ability ?? lead?.ability ?? "sagesse";
  const ability =
    input.stance === "help"
      ? helpAbilityFor(leadAbility)
      : opposeAbilityFor(leadAbility);
  const sheet = sheetOf(player.id);
  const abilityScore = abilityScoreFor(sheet, ability);
  const mod = statModifier(abilityScore);
  const roll = rollAbilityCheck(mod);
  return addPickAndMaybeResolve(check, {
    playerId: player.id,
    playerName: player.name,
    kind: input.stance,
    ability,
    abilityScore,
    modifier: mod,
    natural: roll.natural,
  });
}

export function resolveSceneCheckNow(input: {
  roomId: string;
  actorPlayerId: string;
  checkId: string;
}): void {
  const check = byRoom.get(input.roomId);
  if (!check || check.id !== input.checkId) {
    throw new SceneCheckHttpError(404, "Aucune épreuve en cours");
  }
  const mayResolve =
    input.actorPlayerId === check.firstActorId ||
    alreadyPicked(check, input.actorPlayerId);
  if (!mayResolve) {
    throw new SceneCheckHttpError(
      403,
      "Choisissez d'abord (ou laissez faire) avant de lancer le tour"
    );
  }
  resolveInternal(input.roomId, input.checkId, "manual");
}

function implicitPassers(roomId: string, check: InternalSceneCheck): InternalPick[] {
  const responded = new Set(check.picks.map((p) => p.playerId));
  return listPlayers(roomId)
    .filter(canHumanParticipateInChat)
    .filter((p) => !responded.has(p.id))
    .map((p) => ({
      playerId: p.id,
      playerName: p.name,
      kind: "pass" as const,
      modifier: 0,
      natural: 0,
    }));
}

function toActorRoll(pick: InternalPick, keptNatural: number, usedAdvantage: boolean): SceneCheckRoll {
  const other =
    usedAdvantage && pick.naturalAlt != null && pick.naturalAlt !== keptNatural
      ? pick.naturalAlt
      : usedAdvantage
        ? pick.natural
        : undefined;
  return {
    playerId: pick.playerId,
    playerName: pick.playerName,
    stance: "actor",
    ability: pick.ability ?? "sagesse",
    abilityScore: pick.abilityScore,
    natural: keptNatural,
    naturalAlt: other,
    modifier: pick.modifier,
    total: keptNatural + pick.modifier,
  };
}

function helperRolls(picks: InternalPick[]): SceneCheckRoll[] {
  return picks
    .filter((p) => p.kind === "help")
    .map((h) => ({
      playerId: h.playerId,
      playerName: h.playerName,
      stance: "help" as const,
      ability: h.ability ?? "sagesse",
      abilityScore: h.abilityScore,
      natural: h.natural,
      modifier: h.modifier,
      total: h.natural + h.modifier,
    }));
}

function opposerRolls(picks: InternalPick[]): SceneCheckRoll[] {
  return picks
    .filter((p) => p.kind === "oppose")
    .map((o) => ({
      playerId: o.playerId,
      playerName: o.playerName,
      stance: "oppose" as const,
      ability: o.ability ?? "sagesse",
      abilityScore: o.abilityScore,
      natural: o.natural,
      modifier: o.modifier,
      total: o.natural + o.modifier,
    }));
}

function resolveInternal(
  roomId: string,
  checkId: string,
  _reason: "timeout" | "manual" | "complete"
): void {
  const check = byRoom.get(roomId);
  if (!check || check.id !== checkId || check.resolving) return;
  check.resolving = true;
  clearTimeoutSafe(check);
  byRoom.delete(roomId);
  // Ne pas consommer le message source ici - les autres choix restent cliquables
  // consumeSource(roomId, check.sourceMessageId);
  emit(roomId, null);

  const allPicks = [...check.picks, ...implicitPassers(roomId, check)];
  const choicePicks = allPicks.filter((p) => p.kind === "choice");
  const helpers = helperRolls(allPicks);
  const opposers = opposerRolls(allPicks);
  const passers = allPicks
    .filter((p) => p.kind === "pass")
    .map((p) => ({ playerId: p.playerId, playerName: p.playerName }));

  const usedAdvantage = helpers.some((h) => helperGrantsAdvantage(h.total));
  const actorsResolved = choicePicks.map((pick, index) => {
    const grantAdv = index === 0 && usedAdvantage;
    const keptNatural = grantAdv
      ? Math.max(pick.natural, pick.naturalAlt ?? pick.natural)
      : pick.natural;
    const actorTotal = keptNatural + pick.modifier;
    const worldTotal =
      pick.worldNatural != null && pick.worldMod != null
        ? pick.worldNatural + pick.worldMod
        : undefined;
    const spec = pick.spec ?? inferSceneCheck(pick.choice ?? "", 0);
    const judged = resolveSceneCheckOutcome({
      actorKeptNatural: keptNatural,
      actorModifier: pick.modifier,
      actorTotal,
      dc: spec.dc,
      mode: spec.mode,
      opposers: index === 0 ? opposers : [],
      worldTotal,
    });
    return {
      choice: pick.choice ?? "",
      ability: spec.ability,
      abilityLabel: STAT_LABELS[spec.ability],
      skillHint: spec.skillHint,
      mode: spec.mode,
      dc: spec.dc,
      spec,
      actor: toActorRoll(pick, keptNatural, grantAdv),
      helpers: index === 0 ? helpers : [],
      opposers: index === 0 ? opposers : [],
      usedAdvantage: grantAdv,
      worldNatural: pick.worldNatural,
      worldMod: pick.worldMod,
      worldTotal,
      oppositionTotal: judged.oppositionTotal,
      outcome: judged.outcome,
      outcomeLine: judged.outcomeLine,
    };
  });

  const lead = choicePicks[0] ?? allPicks[0];
  if (!lead) return;

  const content =
    actorsResolved.length === 1 && passers.length === 0
      ? formatSceneCheckActionMessage(actorsResolved[0]!)
      : formatSceneChoiceRoundActionMessage({
          offeredChoices: check.offeredChoices,
          actors: actorsResolved,
          passers,
        });

  const player = getPlayerById(lead.playerId);
  const msg = saveMessage(
    roomId,
    lead.playerId,
    lead.playerName,
    content,
    "action",
    player?.preferredLocale
  );
  broadcastMessage(roomId, msg);
  scheduleActionMj(roomId, lead.playerId, lead.playerName, content);
}

function previousMjMessage(roomId: string, currentId: string) {
  const mjs = listMessages(roomId, 80).filter((m) => m.kind === "mj");
  const idx = mjs.findIndex((m) => m.id === currentId);
  if (idx > 0) return mjs[idx - 1];
  return undefined;
}

function onNewMjMessage(roomId: string, messageId: string, content: string): void {
  const open = byRoom.get(roomId);
  if (open && !open.resolving && open.sourceMessageId !== messageId) {
    abandonOpenRound(roomId, open.sourceMessageId);
  }
  const prev = previousMjMessage(roomId, messageId);
  if (prev && extractMjChoices(prev.content).length >= 2) {
    consumeSource(roomId, prev.id);
  }
  if (extractMjChoices(content).length < 2) {
    consumeSource(roomId, messageId);
  }
  emit(roomId, getOpenSceneCheck(roomId));
}

function onFreePlayerAction(roomId: string): void {
  const open = byRoom.get(roomId);
  if (open && !open.resolving) return;
  const mj = lastMjMessage(roomId);
  if (mj && extractMjChoices(mj.content).length >= 2) {
    consumeSource(roomId, mj.id);
    emit(roomId, null);
  }
}

setAfterMessageSave((msg) => {
  try {
    if (msg.kind === "mj") {
      onNewMjMessage(msg.roomId, msg.id, msg.content);
      return;
    }
    if (msg.kind === "action" && !isSceneCheckActionContent(msg.content)) {
      onFreePlayerAction(msg.roomId);
    }
  } catch (err) {
    console.error("[scene-check] after-save", err);
  }
});
