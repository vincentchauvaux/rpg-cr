import type { Player, PresenceStatus } from "@rpg-cr/shared";

/** roomId → playerIds connectés via WS */
const connectedByRoom = new Map<string, Set<string>>();
/** roomId → playerIds en intention de quitter */
const leavingByRoom = new Map<string, Set<string>>();

function roomSet(map: Map<string, Set<string>>, roomId: string): Set<string> {
  let set = map.get(roomId);
  if (!set) {
    set = new Set();
    map.set(roomId, set);
  }
  return set;
}

export function markPlayerConnected(roomId: string, playerId: string): void {
  roomSet(connectedByRoom, roomId).add(playerId);
  leavingByRoom.get(roomId)?.delete(playerId);
}

export function markPlayerDisconnected(roomId: string, playerId: string): void {
  connectedByRoom.get(roomId)?.delete(playerId);
}

export function markPlayerLeaving(roomId: string, playerId: string): void {
  roomSet(leavingByRoom, roomId).add(playerId);
}

export function isPlayerConnected(roomId: string, playerId: string): boolean {
  return connectedByRoom.get(roomId)?.has(playerId) ?? false;
}

export function isPlayerLeaving(roomId: string, playerId: string): boolean {
  return leavingByRoom.get(roomId)?.has(playerId) ?? false;
}

export function computePresenceStatus(
  player: Player,
  roomId: string
): PresenceStatus {
  if (player.circleStatus === "withdrawn" || isPlayerLeaving(roomId, player.id)) {
    return "leaving";
  }

  const connected = isPlayerConnected(roomId, player.id);

  if (player.kind === "human") {
    if (player.characterStatus !== "ready" || !player.introducedInStory) {
      return "arriving";
    }
  }

  if (player.circleStatus === "pending") {
    return "arriving";
  }

  if (connected) {
    return "active";
  }

  return "offline";
}

export function enrichPlayersWithPresence(
  roomId: string,
  players: Player[]
): Player[] {
  return players.map((p) => ({
    ...p,
    presenceStatus: computePresenceStatus(p, roomId),
  }));
}
