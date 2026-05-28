const GRAINS_KEY = "rpg-cr-grains";

export interface GrainRecord {
  roomId: string;
  roomCode: string;
  roomName: string;
  playerId: string;
  playerName: string;
  role: "admin" | "player";
  lastVisitedAt: string;
}

export function listGrains(): GrainRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GRAINS_KEY);
    const list = raw ? (JSON.parse(raw) as GrainRecord[]) : [];
    return list.sort(
      (a, b) =>
        new Date(b.lastVisitedAt).getTime() - new Date(a.lastVisitedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function rememberGrain(record: Omit<GrainRecord, "lastVisitedAt"> & { lastVisitedAt?: string }): void {
  const grains = listGrains();
  const now = record.lastVisitedAt ?? new Date().toISOString();
  const next: GrainRecord = { ...record, lastVisitedAt: now };
  const filtered = grains.filter(
    (g) => !(g.roomCode === next.roomCode && g.playerId === next.playerId)
  );
  filtered.unshift(next);
  localStorage.setItem(GRAINS_KEY, JSON.stringify(filtered.slice(0, 24)));
}

export function removeGrain(roomCode: string, playerId?: string): void {
  const grains = listGrains().filter((g) => {
    if (g.roomCode.toUpperCase() !== roomCode.toUpperCase()) return true;
    if (playerId && g.playerId !== playerId) return true;
    return false;
  });
  localStorage.setItem(GRAINS_KEY, JSON.stringify(grains));
}

/** Graine la plus récente pour un code salon (reprise sans doublon joueur). */
export function findMostRecentGrainForRoom(roomCode: string): GrainRecord | null {
  const code = roomCode.toUpperCase();
  const match = listGrains().find((g) => g.roomCode.toUpperCase() === code);
  return match ?? null;
}

export function touchGrain(roomCode: string, playerId: string): void {
  const grains = listGrains();
  const idx = grains.findIndex(
    (g) =>
      g.roomCode.toUpperCase() === roomCode.toUpperCase() && g.playerId === playerId
  );
  if (idx === -1) return;
  grains[idx].lastVisitedAt = new Date().toISOString();
  localStorage.setItem(GRAINS_KEY, JSON.stringify(grains));
}
