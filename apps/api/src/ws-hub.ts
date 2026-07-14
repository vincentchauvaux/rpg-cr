import type { WebSocket } from "ws";
import type { ChatMessage, Player, SceneState } from "@rpg-cr/shared";
import {
  enrichPlayersWithPresence,
  markPlayerConnected,
  markPlayerDisconnected,
  markPlayerLeaving,
} from "./presence.js";

interface Client {
  ws: WebSocket;
  roomId: string;
  playerId: string;
  playerName: string;
}

type MjPhase = "opening" | "turn";
export type MjThinkingKind = "narrative" | "background";

export type MjThinkingBeginOpts = {
  phase?: MjPhase;
  kind?: MjThinkingKind;
};

interface MjRoomState {
  narrativeRefs: number;
  backgroundRefs: number;
  openingRefs: number;
}

const clients = new Map<WebSocket, Client>();
const mjByRoom = new Map<string, MjRoomState>();

const WS_CONNECTING = 0;
const WS_OPEN = 1;

export { markPlayerLeaving };

function mjPhaseForState(s: MjRoomState): MjPhase {
  return s.openingRefs > 0 ? "opening" : "turn";
}

function getMjRoomState(roomId: string): MjRoomState | undefined {
  const s = mjByRoom.get(roomId);
  const active =
    s &&
    (s.narrativeRefs > 0 || s.backgroundRefs > 0 || s.openingRefs > 0);
  if (!s || !active) {
    if (s) mjByRoom.delete(roomId);
    return undefined;
  }
  return s;
}

function parseBeginOpts(
  phaseOrOpts?: MjPhase | MjThinkingBeginOpts
): MjThinkingBeginOpts {
  if (!phaseOrOpts) return { phase: "turn", kind: "narrative" };
  if (phaseOrOpts === "opening" || phaseOrOpts === "turn") {
    return { phase: phaseOrOpts, kind: "narrative" };
  }
  return {
    phase: phaseOrOpts.phase ?? "turn",
    kind: phaseOrOpts.kind ?? "narrative",
  };
}

function parseEndOpts(
  phaseOrOpts?: MjPhase | MjThinkingBeginOpts
): MjThinkingBeginOpts {
  return parseBeginOpts(phaseOrOpts);
}

function emitMjStatus(roomId: string): void {
  const s = getMjRoomState(roomId);
  if (!s) {
    broadcastToRoom(roomId, {
      type: "mj_status",
      thinking: false,
      background: false,
      phase: "turn",
    });
    return;
  }
  const narrative = s.narrativeRefs > 0 || s.openingRefs > 0;
  broadcastToRoom(roomId, {
    type: "mj_status",
    thinking: narrative,
    background: s.backgroundRefs > 0,
    phase: mjPhaseForState(s),
  });
}

/** Début d'un appel MJ (refcount — plusieurs jobs peuvent se chevaucher). */
export function mjThinkingBegin(
  roomId: string,
  phaseOrOpts?: MjPhase | MjThinkingBeginOpts
): void {
  const { phase, kind } = parseBeginOpts(phaseOrOpts);
  const s = mjByRoom.get(roomId) ?? {
    narrativeRefs: 0,
    backgroundRefs: 0,
    openingRefs: 0,
  };
  if (kind === "background") {
    s.backgroundRefs += 1;
  } else {
    s.narrativeRefs += 1;
    if (phase === "opening") s.openingRefs += 1;
  }
  mjByRoom.set(roomId, s);
  emitMjStatus(roomId);
}

/** Fin d'un appel MJ — émet `thinking: false` quand le dernier job se termine. */
export function mjThinkingEnd(
  roomId: string,
  phaseOrOpts?: MjPhase | MjThinkingBeginOpts
): void {
  const { phase, kind } = parseEndOpts(phaseOrOpts);
  const s = mjByRoom.get(roomId);
  if (!s) {
    mjByRoom.delete(roomId);
    broadcastToRoom(roomId, {
      type: "mj_status",
      thinking: false,
      background: false,
      phase: "turn",
    });
    return;
  }
  if (kind === "background") {
    s.backgroundRefs = Math.max(0, s.backgroundRefs - 1);
  } else {
    if (phase === "opening" && s.openingRefs > 0) s.openingRefs -= 1;
    s.narrativeRefs = Math.max(0, s.narrativeRefs - 1);
  }
  if (
    s.narrativeRefs <= 0 &&
    s.backgroundRefs <= 0 &&
    s.openingRefs <= 0
  ) {
    mjByRoom.delete(roomId);
    broadcastToRoom(roomId, {
      type: "mj_status",
      thinking: false,
      background: false,
      phase: "turn",
    });
    return;
  }
  mjByRoom.set(roomId, s);
  emitMjStatus(roomId);
}

export type MjStatusSnapshot = {
  thinking: boolean;
  background: boolean;
  phase: MjPhase;
};

export function getMjStatusForRoom(roomId: string): MjStatusSnapshot {
  const s = getMjRoomState(roomId);
  if (!s) {
    return { thinking: false, background: false, phase: "turn" };
  }
  return {
    thinking: s.narrativeRefs > 0 || s.openingRefs > 0,
    background: s.backgroundRefs > 0,
    phase: mjPhaseForState(s),
  };
}

function sendMjStatusSnapshot(ws: WebSocket, roomId: string): void {
  const snap = getMjStatusForRoom(roomId);
  const payload = { type: "mj_status" as const, ...snap };
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

function evictOtherSocketsForPlayer(
  roomId: string,
  playerId: string,
  keep: WebSocket
): void {
  for (const [ws, client] of clients) {
    if (
      client.roomId === roomId &&
      client.playerId === playerId &&
      ws !== keep
    ) {
      clients.delete(ws);
      if (ws.readyState === WS_OPEN || ws.readyState === WS_CONNECTING) {
        ws.close(4001, "replaced");
      }
    }
  }
}

function hasOtherOpenSocket(
  roomId: string,
  playerId: string,
  except?: WebSocket
): boolean {
  for (const [ws, client] of clients) {
    if (
      client.roomId === roomId &&
      client.playerId === playerId &&
      ws !== except &&
      (ws.readyState === WS_OPEN || ws.readyState === WS_CONNECTING)
    ) {
      return true;
    }
  }
  return false;
}

export function registerClient(
  ws: WebSocket,
  roomId: string,
  playerId: string,
  playerName: string
): void {
  evictOtherSocketsForPlayer(roomId, playerId, ws);
  clients.set(ws, { ws, roomId, playerId, playerName });
  markPlayerConnected(roomId, playerId);
  sendMjStatusSnapshot(ws, roomId);
}

export function unregisterClient(ws: WebSocket): void {
  const client = clients.get(ws);
  if (client) {
    if (!hasOtherOpenSocket(client.roomId, client.playerId, ws)) {
      markPlayerDisconnected(client.roomId, client.playerId);
    }
  }
  clients.delete(ws);
}

export function broadcastToRoom(
  roomId: string,
  payload: unknown,
  except?: WebSocket
): void {
  const data = JSON.stringify(payload);
  for (const [ws, client] of clients) {
    if (client.roomId === roomId && ws !== except && ws.readyState === 1) {
      ws.send(data);
    }
  }
}

export function broadcastMessage(roomId: string, message: ChatMessage): void {
  broadcastToRoom(roomId, { type: "message", message });
}

export function broadcastPlayers(roomId: string, players: Player[]): void {
  const enriched = enrichPlayersWithPresence(roomId, players);
  broadcastToRoom(roomId, { type: "players", players: enriched });
}

/** @deprecated Préférer mjThinkingBegin / mjThinkingEnd pour le refcount salon. */
export function broadcastMjStatus(
  roomId: string,
  thinking: boolean,
  phase: MjPhase = "turn"
): void {
  if (thinking) mjThinkingBegin(roomId, phase);
  else mjThinkingEnd(roomId, { phase: phase === "opening" ? "opening" : "turn" });
}

export function broadcastScene(roomId: string, scene: SceneState): void {
  broadcastToRoom(roomId, { type: "scene", scene });
}

export function broadcastCharacterGenProgress(
  roomId: string,
  playerId: string,
  payload: {
    percent: number;
    phase: string;
    label: string;
    sheet: import("@rpg-cr/shared").CharacterSheet;
  }
): void {
  broadcastToRoom(roomId, {
    type: "character_gen_progress",
    playerId,
    percent: payload.percent,
    phase: payload.phase,
    label: payload.label,
    sheet: payload.sheet,
  });
}
