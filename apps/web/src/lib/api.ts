import type {
  CampaignSummary,
  ChatMessage,
  LlmCatalogEntry,
  LlmRoomConfig,
  Player,
  PlayerMeta,
  ProceduralMap,
  Quest,
  Room,
} from "@rpg-cr/shared";
import { getApiUrl } from "./config";
import { formatFetchError, formatHttpError, isHttpError } from "./api-errors";
import { markHealthOk } from "./api-health";

const RETRY_DELAYS_MS = [0, 400, 1200];
const DEFAULT_TIMEOUT_MS = 30_000;
/** Aligné sur `resolveLlmTimeoutMs` côté API (LM Studio jusqu'à 240 s + marge réseau). */
const MJ_TIMEOUT_MS = 270_000;
/** Fill-all : LLM local (gemma, etc.) peut dépasser 2 min — aligné sous le timeout API (180 s). */
const GENERATE_ALL_TIMEOUT_MS = 270_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error) {
    return /fetch|network|Failed to fetch|Load failed|aborted/i.test(error.message);
  }
  return false;
}

function timeoutForPath(path: string): number {
  if (path.includes("generate-all")) {
    return GENERATE_ALL_TIMEOUT_MS;
  }
  if (
    path.includes("/mj") ||
    path.includes("ask-mj") ||
    path.includes("hero-assistant") ||
    path.includes("generate-field") ||
    path.includes("/introduce") ||
    path.includes("/translate")
  ) {
    return MJ_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const apiUrl = getApiUrl();
  const timeoutMs = timeoutForPath(path);
  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (RETRY_DELAYS_MS[attempt] > 0) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${apiUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });

      if (path === "/health" || res.ok) {
        markHealthOk();
      }

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        let serverMessage: string | undefined;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { error?: string; message?: string };
            serverMessage = parsed.error ?? parsed.message;
          } catch {
            serverMessage = raw.slice(0, 200);
          }
        }
        if (path.includes("generate-all") && res.status !== 403 && res.status !== 429) {
          console.error("[fetchJson] generate-all HTTP", res.status, serverMessage ?? raw.slice(0, 200));
        }
        throw formatHttpError(res.status, serverMessage);
      }

      return (await res.json()) as T;
    } catch (error) {
      lastError = error;

      if (isHttpError(error)) {
        throw error;
      }

      const retryable = isNetworkError(error);
      if (!retryable || attempt === RETRY_DELAYS_MS.length - 1) {
        if (retryable) {
          throw new Error(await formatFetchError(error, apiUrl, path));
        }
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(await formatFetchError(lastError, apiUrl, path));
}

export function getLlmCatalog(): Promise<LlmCatalogEntry[]> {
  return fetchJson("/api/llm/catalog");
}

export function listLmStudioModels(baseUrl?: string): Promise<{
  all: { id: string; kind: string }[];
  chatModels: string[];
  embeddingModels: string[];
  resolvedBaseUrl: string;
  modelsUrl: string;
}> {
  const q = baseUrl ? `?baseUrl=${encodeURIComponent(baseUrl)}` : "";
  return fetchJson(`/api/llm/lmstudio/models${q}`);
}

export function createRoom(
  name: string,
  adminName: string,
  userId?: string
): Promise<{
  room: Room;
  admin: Player;
  map: ProceduralMap;
}> {
  return fetchJson("/api/rooms", {
    method: "POST",
    body: JSON.stringify({
      name,
      adminName,
      ...(userId ? { userId } : {}),
    }),
  });
}

export type MjStatusSnapshot = {
  thinking: boolean;
  background: boolean;
  phase: "opening" | "turn";
};

export function getRoom(code: string): Promise<{
  room: Room;
  players: Player[];
  messages: ChatMessage[];
  map: ProceduralMap;
  mjStatus?: MjStatusSnapshot;
}> {
  return fetchJson(`/api/rooms/${code}`);
}

export function joinRoom(
  roomId: string,
  playerName: string,
  existingPlayerId?: string,
  userId?: string
): Promise<{ player: Player; players: Player[]; rejoined?: boolean }> {
  return fetchJson(`/api/rooms/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify({
      playerName,
      ...(existingPlayerId ? { playerId: existingPlayerId } : {}),
      ...(userId ? { userId } : {}),
    }),
  });
}

export function listUserGrainsFromApi(
  userId: string
): Promise<{ grains: import("@rpg-cr/shared").UserGrain[] }> {
  return fetchJson(`/api/users/${userId}/grains`);
}

export function linkPlayerToUserApi(
  playerId: string,
  userId: string
): Promise<{ player: Player }> {
  return fetchJson(`/api/players/${playerId}/link-user`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function setGodMode(
  playerId: string,
  isGodMode: boolean
): Promise<{ player: Player }> {
  return fetchJson(`/api/players/${playerId}/god-mode`, {
    method: "PATCH",
    body: JSON.stringify({ isGodMode }),
  });
}

export function patchPlayerLocale(
  playerId: string,
  locale: string
): Promise<{ player: Player }> {
  return fetchJson(`/api/players/${playerId}/locale`, {
    method: "PATCH",
    body: JSON.stringify({ locale }),
  });
}

export function translateMessage(
  roomId: string,
  body: {
    playerId: string;
    text: string;
    targetLocale: string;
    sourceLocale?: string;
    messageId?: string;
  }
): Promise<{
  text: string;
  translated: boolean;
  fromCache: boolean;
  sourceLocale: string;
  targetLocale: string;
}> {
  return fetchJson(`/api/rooms/${roomId}/translate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function saveLlmConfig(
  roomId: string,
  llmConfig: LlmRoomConfig,
  playerId?: string
): Promise<{ ok: boolean }> {
  return fetchJson(`/api/rooms/${roomId}/llm`, {
    method: "PUT",
    body: JSON.stringify({ llmConfig, playerId }),
  });
}

export function testLlmConfig(
  roomId: string,
  playerId: string,
  apiKey?: string
): Promise<{
  ok: true;
  usedFallback: boolean;
  providerId: string;
  modelId: string;
}> {
  return fetchJson(`/api/rooms/${roomId}/llm/test`, {
    method: "POST",
    body: JSON.stringify({ playerId, apiKey }),
  });
}

export function askMj(
  roomId: string,
  playerId: string,
  prompt: string,
  apiKey?: string
): Promise<{ message: ChatMessage; usedFallback: boolean }> {
  return fetchJson(`/api/rooms/${roomId}/mj`, {
    method: "POST",
    body: JSON.stringify({ playerId, prompt, apiKey }),
  });
}

export type MjPromptType =
  | import("@rpg-cr/shared").MjPlayerTriggerType
  | import("@rpg-cr/shared").MjHostTriggerType;

export function promptMj(
  roomId: string,
  playerId: string,
  type: MjPromptType,
  optionalText?: string
): Promise<{ ok: true; type: string }> {
  return fetchJson(`/api/rooms/${roomId}/mj/prompt`, {
    method: "POST",
    body: JSON.stringify({ playerId, type, optionalText }),
  });
}

export function getQuests(roomId: string): Promise<{ quests: Quest[] }> {
  return fetchJson(`/api/rooms/${roomId}/quests`);
}

export function listCampaigns(codes: string[]): Promise<{ campaigns: CampaignSummary[] }> {
  if (!codes.length) return Promise.resolve({ campaigns: [] });
  const q = encodeURIComponent(codes.join(","));
  return fetchJson(`/api/campaigns?codes=${q}`);
}

export function snapshotCampaign(roomId: string): Promise<{
  ok: boolean;
  dir: string;
  roomCode: string;
  files: string[];
  exportedAt: string;
}> {
  return fetchJson(`/api/rooms/${roomId}/snapshot`, { method: "POST" });
}

export function exportCampaign(roomId: string): Promise<{
  dir: string;
  roomCode: string;
  files: string[];
  exportedAt: string;
}> {
  return fetchJson(`/api/rooms/${roomId}/export`);
}

export function patchPlayerMeta(
  playerId: string,
  actorPlayerId: string,
  patch: Partial<Pick<PlayerMeta, "karma" | "parcours" | "notes">>
): Promise<{ meta: PlayerMeta }> {
  return fetchJson(`/api/players/${playerId}/meta`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, actorPlayerId }),
  });
}

export function addAiPlayer(
  roomId: string,
  actorPlayerId: string,
  name: string
): Promise<{ player: Player; players: Player[] }> {
  return fetchJson(`/api/rooms/${roomId}/ai-players`, {
    method: "POST",
    body: JSON.stringify({ name, actorPlayerId }),
  });
}

export function withdrawAiPlayer(
  roomId: string,
  actorPlayerId: string,
  playerId: string
): Promise<{ player: Player; players: Player[] }> {
  return fetchJson(`/api/rooms/${roomId}/ai-players/${playerId}`, {
    method: "PATCH",
    body: JSON.stringify({ actorPlayerId }),
  });
}

export function patchPlayerDisplayColor(
  playerId: string,
  actorPlayerId: string,
  displayColor: string
): Promise<{ player: Player }> {
  return fetchJson(`/api/players/${playerId}/display-color`, {
    method: "PATCH",
    body: JSON.stringify({ displayColor, actorPlayerId }),
  });
}

export function listGraineFiles(
  roomId: string,
  actorPlayerId: string
): Promise<{ files: string[] }> {
  return fetchJson(
    `/api/rooms/${roomId}/graine?actorPlayerId=${encodeURIComponent(actorPlayerId)}`
  );
}

export function readGraineFile(
  roomId: string,
  actorPlayerId: string,
  filename: string
): Promise<{ filename: string; content: string }> {
  return fetchJson(
    `/api/rooms/${roomId}/graine/${encodeURIComponent(filename)}?actorPlayerId=${encodeURIComponent(actorPlayerId)}`
  );
}

export function patchCharacter(
  playerId: string,
  actorPlayerId: string,
  patch: {
    characterStatus?: import("@rpg-cr/shared").CharacterStatus;
    characterSheet?: import("@rpg-cr/shared").CharacterSheet;
  }
): Promise<{ player: Player }> {
  return fetchJson(`/api/players/${playerId}/character`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, actorPlayerId }),
  });
}

export function getPlayerCharacter(
  playerId: string,
  actorPlayerId: string
): Promise<{
  player: Player;
  characterStatus: import("@rpg-cr/shared").CharacterStatus;
  characterSheet: import("@rpg-cr/shared").CharacterSheet;
}> {
  return fetchJson(
    `/api/players/${playerId}/character?actorPlayerId=${encodeURIComponent(actorPlayerId)}`
  );
}

export function finalizeCharacter(
  playerId: string,
  actorPlayerId: string
): Promise<{ player: Player }> {
  return fetchJson(`/api/players/${playerId}/character/finalize`, {
    method: "POST",
    body: JSON.stringify({ actorPlayerId }),
  });
}

export interface PlayerProgressResponse {
  player: Player;
  skillId: string;
  previousLevel: number;
  newLevel: number;
  previousProgress: number;
  newProgress: number;
  leveledUp: boolean;
  progressAdded: number;
  unlocked?: { skillId: string; sourceSkillId: string };
  reason?: string;
}

export function postPlayerProgress(
  playerId: string,
  actorPlayerId: string,
  body: {
    skillId: string;
    delta?: number;
    intensity?: number;
    reason?: string;
    unlockTags?: string[];
  }
): Promise<PlayerProgressResponse> {
  return fetchJson(`/api/players/${playerId}/progress`, {
    method: "POST",
    body: JSON.stringify({ actorPlayerId, ...body }),
  });
}

export function introducePlayer(
  playerId: string,
  actorPlayerId: string,
  body: { mode: "manual" | "auto"; text?: string }
): Promise<{ player: Player; message: ChatMessage }> {
  return fetchJson(`/api/players/${playerId}/introduce`, {
    method: "POST",
    body: JSON.stringify({ actorPlayerId, ...body }),
  });
}

export function askCharacterMj(
  playerId: string,
  actorPlayerId: string,
  prompt: string
): Promise<{ reply: string }> {
  return fetchJson(`/api/players/${playerId}/character/ask-mj`, {
    method: "POST",
    body: JSON.stringify({ actorPlayerId, prompt }),
  });
}

export function askHeroAssistant(
  playerId: string,
  actorPlayerId: string,
  question: string,
  mode: "creation" | "play" = "play"
): Promise<{ reply: string }> {
  return fetchJson(`/api/players/${playerId}/hero-assistant`, {
    method: "POST",
    body: JSON.stringify({ actorPlayerId, question, mode }),
  });
}

export function generateCharacterField(
  playerId: string,
  actorPlayerId: string,
  field: import("@rpg-cr/shared").CharacterSheetFieldKey,
  currentSheet: import("@rpg-cr/shared").CharacterSheet
): Promise<{ value: string }> {
  return fetchJson(`/api/players/${playerId}/character/generate-field`, {
    method: "POST",
    body: JSON.stringify({ actorPlayerId, field, currentSheet }),
  });
}

export function generateCharacterSection(
  playerId: string,
  actorPlayerId: string,
  section: import("@rpg-cr/shared").CharacterSheetSectionKey,
  currentSheet: import("@rpg-cr/shared").CharacterSheet
): Promise<{ section: string; sheet: import("@rpg-cr/shared").CharacterSheet }> {
  return fetchJson(`/api/players/${playerId}/character/generate-section`, {
    method: "POST",
    body: JSON.stringify({ actorPlayerId, section, currentSheet }),
  });
}

export function generateCharacterAll(
  playerId: string,
  actorPlayerId: string,
  roomId: string,
  currentSheet: import("@rpg-cr/shared").CharacterSheet,
  hints?: string
): Promise<{ sheet: import("@rpg-cr/shared").CharacterSheet }> {
  return fetchJson(`/api/players/${playerId}/character/generate-all`, {
    method: "POST",
    body: JSON.stringify({ actorPlayerId, roomId, currentSheet, hints }),
  });
}

export function getCharacterAllGenerationLock(
  playerId: string,
  actorPlayerId: string
): Promise<{ inFlight: boolean; startedAt: number | null }> {
  return fetchJson(
    `/api/players/${playerId}/character/generate-all-lock?actorPlayerId=${encodeURIComponent(actorPlayerId)}`
  );
}

export function cancelCharacterAllGeneration(
  playerId: string,
  actorPlayerId: string
): Promise<{ released: boolean }> {
  return fetchJson(`/api/players/${playerId}/character/generate-all-lock`, {
    method: "DELETE",
    body: JSON.stringify({ actorPlayerId }),
  });
}

export function fetchMentionSuggestions(
  roomId: string,
  actorPlayerId: string
): Promise<{ candidates: import("@rpg-cr/shared").MentionCandidate[] }> {
  return fetchJson(
    `/api/rooms/${roomId}/mention-suggestions?actorPlayerId=${encodeURIComponent(actorPlayerId)}`
  );
}

export function listNarrativeFacts(
  roomId: string,
  actorPlayerId: string,
  limit = 20
): Promise<{ facts: import("@rpg-cr/shared").NarrativeFact[] }> {
  return fetchJson(
    `/api/rooms/${roomId}/narrative-facts?actorPlayerId=${encodeURIComponent(actorPlayerId)}&limit=${limit}`
  );
}

export function extractNarrativeFacts(
  roomId: string,
  actorPlayerId: string
): Promise<{
  facts: import("@rpg-cr/shared").NarrativeFact[];
  messageId: string | null;
  count: number;
}> {
  return fetchJson(`/api/rooms/${roomId}/narrative-facts/extract`, {
    method: "POST",
    body: JSON.stringify({ actorPlayerId }),
  });
}

export function patchRoomScene(
  roomId: string,
  actorPlayerId: string,
  patch: { location?: string; mood?: string; tension?: number }
): Promise<{ scene: import("@rpg-cr/shared").SceneState }> {
  return fetchJson(`/api/rooms/${roomId}/scene`, {
    method: "PATCH",
    body: JSON.stringify({ actorPlayerId, ...patch }),
  });
}

export function extractRoomScene(
  roomId: string,
  actorPlayerId: string
): Promise<{ scene: import("@rpg-cr/shared").SceneState | null; messageId: string | null }> {
  return fetchJson(`/api/rooms/${roomId}/scene/extract`, {
    method: "POST",
    body: JSON.stringify({ actorPlayerId }),
  });
}

export async function uploadPlayerAvatar(
  playerId: string,
  actorPlayerId: string,
  file: File
): Promise<{ player: Player }> {
  const apiUrl = getApiUrl();
  const form = new FormData();
  form.append("avatar", file);
  form.append("actorPlayerId", actorPlayerId);

  const res = await fetch(`${apiUrl}/api/players/${encodeURIComponent(playerId)}/avatar`, {
    method: "POST",
    body: form,
  });

  if (res.ok) {
    markHealthOk();
    return (await res.json()) as { player: Player };
  }

  const err = (await res.json().catch(() => ({}))) as { error?: string };
  throw formatHttpError(res.status, err.error);
}

export function deletePlayerAvatar(
  playerId: string,
  actorPlayerId: string
): Promise<{ player: Player }> {
  return fetchJson(`/api/players/${playerId}/avatar`, {
    method: "DELETE",
    body: JSON.stringify({ actorPlayerId }),
  });
}
