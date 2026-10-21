import fs from "node:fs";
import path from "node:path";
import {
  advanceAdventure,
  formatAdventureSliceForMj,
  inferAdventureEventKind,
  parseAdventureJson,
  pickNextAdventureNode,
  seedAdventure,
  selectAdventureSlice,
  type Adventure,
  type AdventureEvent,
  type AdventureEventKind,
  type AdvanceAdventureHint,
  type CharacterSheet,
  type ProceduralMap,
} from "@rpg-cr/shared";
import { getCampaignDir } from "./campaign-export.js";
import { getMap, getRoomById, getWorldSeed, listPlayers } from "./rooms.js";
import { getSceneState } from "./room-scene.js";
import { getTableNow } from "./room-table-now.js";

const FILE = "adventure.json";

export function adventureFilePath(roomCode: string): string {
  return path.join(getCampaignDir(roomCode), FILE);
}

export function readAdventure(roomCode: string): Adventure | null {
  const file = adventureFilePath(roomCode);
  if (!fs.existsSync(file)) return null;
  try {
    return parseAdventureJson(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeAdventure(roomCode: string, adventure: Adventure): void {
  const dir = getCampaignDir(roomCode);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = adventureFilePath(roomCode) + ".tmp";
  fs.writeFileSync(tmp, `${JSON.stringify(adventure, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, adventureFilePath(roomCode));
}

export function loadOrSeedAdventure(roomId: string): Adventure | null {
  const room = getRoomById(roomId);
  if (!room) return null;
  const existing = readAdventure(room.code);
  if (existing) return existing;
  const host = listPlayers(roomId).find((p) => p.role === "admin");
  const scene = getSceneState(roomId);
  const table = getTableNow(roomId);
  const seeded = seedAdventure({
    roomCode: room.code,
    roomName: room.name,
    worldSeed: getWorldSeed(roomId) ?? room.mapSeed,
    hostName: host?.name ?? "l'hôte",
    hostSheet: host?.characterSheet,
    map: getMap(roomId),
    when: table?.timeOfDay || scene?.timeOfDay,
    weather: table?.weather || scene?.weather,
    incident: table?.lastBeat,
    placeOverride: table?.location || scene?.location,
  });
  writeAdventure(room.code, seeded);
  return seeded;
}

export function upsertAdventureFromOpening(input: {
  roomId: string;
  hostName: string;
  hostSheet?: CharacterSheet;
  map?: ProceduralMap | null;
  when?: string;
  weather?: string;
  incident?: string;
  place?: string;
}): Adventure | null {
  const room = getRoomById(input.roomId);
  if (!room) return null;
  const current = readAdventure(room.code);
  if (current?.now.nodeId && Object.keys(current.nodes).length > 2) {
    if (input.incident) {
      current.now.lastBeat = input.incident;
      writeAdventure(room.code, current);
    }
    return current;
  }
  const seeded = seedAdventure({
    roomCode: room.code,
    roomName: room.name,
    worldSeed: getWorldSeed(input.roomId) ?? room.mapSeed,
    hostName: input.hostName,
    hostSheet: input.hostSheet,
    map: input.map ?? getMap(input.roomId),
    when: input.when,
    weather: input.weather,
    incident: input.incident,
    placeOverride: input.place,
  });
  writeAdventure(room.code, seeded);
  return seeded;
}

export function adventureSliceForTurn(
  roomId: string,
  opts: {
    kind?: AdventureEventKind;
    text?: string;
    maxChars?: number;
  }
): { adventure: Adventure; block: string } | null {
  const adventure = loadOrSeedAdventure(roomId);
  if (!adventure) return null;
  const table = getTableNow(roomId);
  const scene = getSceneState(roomId);
  const location = table?.location || scene?.location;
  const current = adventure.nodes[adventure.now.nodeId] ?? null;
  const kind =
    opts.kind ?? inferAdventureEventKind(opts.text, "action", current);
  const preview = pickNextAdventureNode(adventure, {
    kind,
    text: opts.text,
    location,
  });
  const event: AdventureEvent = {
    kind,
    text: opts.text,
    nodeId: preview?.id ?? adventure.now.nodeId,
    placeId: preview?.placeId ?? adventure.now.placeId,
    locationText: location,
  };
  const slice = selectAdventureSlice(adventure, event);
  if (table?.lastBeat) slice.now.lastBeat = table.lastBeat;
  if (table?.timeOfDay) slice.now.timeOfDay = table.timeOfDay;
  if (table?.weather) slice.now.weather = table.weather;
  if (scene?.tension != null) slice.now.tension = scene.tension;
  const max = opts.maxChars ?? 2800;
  return { adventure, block: formatAdventureSliceForMj(slice, max) };
}

/** Écrit `now` après un tour MJ réussi (sorties + lieu scène/table). */
export function commitAdventureAfterTurn(
  roomId: string,
  hint: AdvanceAdventureHint
): Adventure | null {
  const room = getRoomById(roomId);
  if (!room) return null;
  const adventure = loadOrSeedAdventure(roomId);
  if (!adventure) return null;
  const table = getTableNow(roomId);
  const scene = getSceneState(roomId);
  const { adventure: next } = advanceAdventure(adventure, {
    ...hint,
    location: hint.location || table?.location || scene?.location,
    timeOfDay: hint.timeOfDay || table?.timeOfDay || scene?.timeOfDay,
    weather: hint.weather || table?.weather,
    tension: hint.tension ?? scene?.tension,
    lastBeat: hint.lastBeat || table?.lastBeat || hint.text,
  });
  writeAdventure(room.code, next);
  return next;
}
