import { randomUUID } from "node:crypto";
import type { CharacterSheet, Player, SceneCheckPublic, StatKey } from "@rpg-cr/shared";
import {
  STAT_LABELS,
  canHumanParticipateInChat,
  extractMjChoices,
  formatSceneCheckActionMessage,
  helpAbilityFor,
  helperGrantsAdvantage,
  inferSceneCheck,
  matchChoice,
  opposeAbilityFor,
  resolveSceneCheckOutcome,
  rollAbilityCheck,
  statModifier,
  toSceneCheckPublic,
  type SceneCheckRoll,
} from "@rpg-cr/shared";
import { getCharacter } from "./character.js";
import { listMessages, saveMessage } from "./messages.js";
import { scheduleActionMj } from "./mj-auto.js";
import { getSceneState } from "./room-scene.js";
import { getPlayerById, listPlayers } from "./rooms.js";
import { broadcastMessage, broadcastSceneCheck } from "./ws-hub.js";

const TABLE_WINDOW_MS = 18_000;
const SOLO_WINDOW_MS = 600;

type InternalSceneCheck = {
  id: string;
  roomId: string;
  sourceMessageId: string;
  choice: string;
  spec: ReturnType<typeof inferSceneCheck>;
  actor: Player;
  actorMod: number;
  actorFirst: number;
  actorSecond: number;
  worldNatural: number;
  worldMod: number;
  helpers: SceneCheckRoll[];
  opposers: SceneCheckRoll[];
  expiresAt: number;
  timeout: ReturnType<typeof setTimeout>;
  resolving: boolean;
};

const byRoom = new Map<string, InternalSceneCheck>();

export class SceneCheckHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "SceneCheckHttpError";
  }
}

function modifierFor(sheet: CharacterSheet | undefined, ability: StatKey): number {
  const score = sheet?.stats?.[ability] ?? 10;
  return statModifier(score);
}

function sheetOf(playerId: string): CharacterSheet | undefined {
  return getCharacter(playerId)?.characterSheet;
}

function countReadyHumans(roomId: string): number {
  return listPlayers(roomId).filter(canHumanParticipateInChat).length;
}

function toPublic(check: InternalSceneCheck): SceneCheckPublic {
  return toSceneCheckPublic({
    id: check.id,
    roomId: check.roomId,
    sourceMessageId: check.sourceMessageId,
    choice: check.choice,
    spec: check.spec,
    actorPlayerId: check.actor.id,
    actorPlayerName: check.actor.name,
    expiresAt: check.expiresAt,
    helpers: check.helpers.map((h) => ({
      playerId: h.playerId,
      playerName: h.playerName,
      ability: h.ability,
    })),
    opposers: check.opposers.map((o) => ({
      playerId: o.playerId,
      playerName: o.playerName,
      ability: o.ability,
    })),
    status: "open",
  });
}

function emit(roomId: string, check: SceneCheckPublic | null): void {
  broadcastSceneCheck(roomId, check);
}

export function getOpenSceneCheck(roomId: string): SceneCheckPublic | null {
  const check = byRoom.get(roomId);
  if (!check || check.resolving) return null;
  return toPublic(check);
}

function lastMjMessage(roomId: string) {
  const messages = listMessages(roomId, 80);
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.kind === "mj") return messages[i];
  }
  return undefined;
}

function clearTimeoutSafe(check: InternalSceneCheck): void {
  clearTimeout(check.timeout);
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
    throw new SceneCheckHttpError(
      409,
      `${existing.actor.name} tente déjà un choix — attendez la résolution`
    );
  }

  const mj = lastMjMessage(input.roomId);
  if (!mj || mj.id !== input.sourceMessageId) {
    throw new SceneCheckHttpError(400, "Ce choix n'est plus d'actualité");
  }

  const choices = extractMjChoices(mj.content);
  const choice = matchChoice(choices, input.choice);
  if (!choice) {
    throw new SceneCheckHttpError(400, "Choix introuvable dans le récit du MJ");
  }

  const tension = getSceneState(input.roomId)?.tension ?? 0;
  const spec = inferSceneCheck(choice, tension);
  const actorMod = modifierFor(sheetOf(actor.id), spec.ability);
  const actorRoll = rollAbilityCheck(actorMod);
  const actorAlt = rollAbilityCheck(actorMod);
  const world = rollAbilityCheck(spec.worldMod);

  const humans = countReadyHumans(input.roomId);
  const windowMs = humans <= 1 ? SOLO_WINDOW_MS : TABLE_WINDOW_MS;
  const id = randomUUID();
  const expiresAt = Date.now() + windowMs;

  const record: InternalSceneCheck = {
    id,
    roomId: input.roomId,
    sourceMessageId: input.sourceMessageId,
    choice,
    spec,
    actor,
    actorMod,
    actorFirst: actorRoll.natural,
    actorSecond: actorAlt.natural,
    worldNatural: world.natural,
    worldMod: spec.worldMod,
    helpers: [],
    opposers: [],
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
  stance: "help" | "oppose";
}): SceneCheckPublic {
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
  if (player.id === check.actor.id) {
    throw new SceneCheckHttpError(400, "Vous êtes déjà l'auteur de ce choix");
  }
  if (
    check.helpers.some((h) => h.playerId === player.id) ||
    check.opposers.some((o) => o.playerId === player.id)
  ) {
    throw new SceneCheckHttpError(409, "Vous avez déjà jeté les dés pour cette épreuve");
  }

  const ability =
    input.stance === "help"
      ? helpAbilityFor(check.spec.ability)
      : opposeAbilityFor(check.spec.ability);
  const mod = modifierFor(sheetOf(player.id), ability);
  const roll = rollAbilityCheck(mod);
  const entry: SceneCheckRoll = {
    playerId: player.id,
    playerName: player.name,
    stance: input.stance,
    ability,
    natural: roll.natural,
    modifier: mod,
    total: roll.total,
  };

  if (input.stance === "help") check.helpers.push(entry);
  else check.opposers.push(entry);

  const pub = toPublic(check);
  emit(input.roomId, pub);
  return pub;
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
  if (input.actorPlayerId !== check.actor.id) {
    throw new SceneCheckHttpError(403, "Seul l'auteur du choix peut relancer tout de suite");
  }
  resolveInternal(input.roomId, input.checkId, "manual");
}

function resolveInternal(
  roomId: string,
  checkId: string,
  _reason: "timeout" | "manual"
): void {
  const check = byRoom.get(roomId);
  if (!check || check.id !== checkId || check.resolving) return;
  check.resolving = true;
  clearTimeoutSafe(check);
  byRoom.delete(roomId);
  emit(roomId, null);

  const usedAdvantage = check.helpers.some((h) =>
    helperGrantsAdvantage(h.total)
  );
  const keptNatural = usedAdvantage
    ? Math.max(check.actorFirst, check.actorSecond)
    : check.actorFirst;
  const otherNatural = usedAdvantage
    ? check.actorFirst === keptNatural
      ? check.actorSecond
      : check.actorFirst
    : undefined;
  const actorTotal = keptNatural + check.actorMod;
  const worldTotal = check.worldNatural + check.worldMod;

  const judged = resolveSceneCheckOutcome({
    actorKeptNatural: keptNatural,
    actorModifier: check.actorMod,
    actorTotal,
    dc: check.spec.dc,
    mode: check.spec.mode,
    opposers: check.opposers,
    worldTotal,
  });

  const actorRoll: SceneCheckRoll = {
    playerId: check.actor.id,
    playerName: check.actor.name,
    stance: "actor",
    ability: check.spec.ability,
    natural: keptNatural,
    naturalAlt: otherNatural,
    modifier: check.actorMod,
    total: actorTotal,
  };

  const content = formatSceneCheckActionMessage({
    choice: check.choice,
    ability: check.spec.ability,
    abilityLabel: STAT_LABELS[check.spec.ability],
    skillHint: check.spec.skillHint,
    mode: check.spec.mode,
    dc: check.spec.dc,
    spec: check.spec,
    actor: actorRoll,
    helpers: check.helpers,
    opposers: check.opposers,
    usedAdvantage,
    worldNatural: check.worldNatural,
    worldMod: check.worldMod,
    worldTotal,
    oppositionTotal: judged.oppositionTotal,
    outcome: judged.outcome,
    outcomeLine: judged.outcomeLine,
  });

  const msg = saveMessage(
    roomId,
    check.actor.id,
    check.actor.name,
    content,
    "action",
    check.actor.preferredLocale
  );
  broadcastMessage(roomId, msg);
  scheduleActionMj(roomId, check.actor.id, check.actor.name, content);
}
