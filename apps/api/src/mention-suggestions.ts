import { isCompanionNarrativelyActive, type MentionCandidate } from "@rpg-cr/shared";
import { buildEstablishedCanonSummary } from "./established-canon.js";
import { listMessages } from "./messages.js";
import { listNarrativeFacts } from "./narrative-facts.js";
import { getSceneState } from "./room-scene.js";
import { listPlayers } from "./rooms.js";

const MESSAGE_SCAN_LIMIT = 80;

function normKey(name: string): string {
  return name.trim().toLowerCase();
}

function formatLieuHint(place: string): string {
  const p = place.trim();
  if (!p) return "Lieu inconnu";
  if (/^lieu\s·/i.test(p)) return p;
  return `Lieu · ${p}`;
}

/** « à la Taverne », « au marché », « dans les cryptes »… */
const AT_PLACE_RE =
  /\b(?:à|au|aux|dans|en|sur)\s+(?:la|le|l'|les\s+)?([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸ][\w\s''-]{2,48})/gu;

function findPlaceNearName(text: string, name: string): string | null {
  const nameLower = name.trim().toLowerCase();
  if (!nameLower) return null;
  const lower = text.toLowerCase();
  let idx = 0;
  while (idx < lower.length) {
    const pos = lower.indexOf(nameLower, idx);
    if (pos < 0) break;
    const start = Math.max(0, pos - 100);
    const end = Math.min(text.length, pos + name.length + 100);
    const window = text.slice(start, end);
    const places: string[] = [];
    for (const m of window.matchAll(AT_PLACE_RE)) {
      const place = m[1]?.trim();
      if (place && place.length >= 3) places.push(place);
    }
    if (places.length) return places[places.length - 1]!;
    idx = pos + name.length;
  }
  return null;
}

/** Dernière occurrence d'un lieu proche du nom dans le fil MJ/PJ. */
function buildEncounterLocationMap(roomId: string): Map<string, string> {
  const found = new Map<string, string>();
  const messages = listMessages(roomId)
    .filter(
      (m) =>
        m.kind === "mj" ||
        m.kind === "say" ||
        m.kind === "chat" ||
        m.kind === "action"
    )
    .slice(-MESSAGE_SCAN_LIMIT);

  for (const fact of listNarrativeFacts(roomId, 40)) {
    const summary = fact.summary.trim();
    if (!summary) continue;
    for (const m of summary.matchAll(AT_PLACE_RE)) {
      const place = m[1]?.trim();
      if (!place) continue;
      for (const word of summary.split(/\s+/)) {
        const w = word.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ'-]+$/g, "");
        if (w.length >= 3 && /^[A-ZÀ-ÿ]/.test(w)) {
          const key = normKey(w);
          if (!found.has(key)) found.set(key, place);
        }
      }
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i]!.content;
    if (!text.trim()) continue;
    const namesInMsg = new Set<string>();
    const nameRe =
      /(?:^|[\s,.;:!?«"'(\[])([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸ][a-zàâäéèêëïîôùûüÿç'-]+)/gu;
    for (const m of text.matchAll(nameRe)) {
      const n = m[1]?.trim();
      if (n && n.length >= 2) namesInMsg.add(n);
    }
    for (const name of namesInMsg) {
      const key = normKey(name);
      if (found.has(key)) continue;
      const place = findPlaceNearName(text, name);
      if (place) found.set(key, place);
    }
  }

  return found;
}

function addCandidate(
  map: Map<string, MentionCandidate>,
  name: string,
  kind: MentionCandidate["kind"],
  hint?: string
): void {
  const trimmed = name.trim();
  if (trimmed.length < 2) return;
  const key = normKey(trimmed);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { name: trimmed, kind, hint });
    return;
  }
  const priority: Record<MentionCandidate["kind"], number> = {
    player: 0,
    companion: 1,
    character: 2,
  };
  if (priority[kind] < priority[existing.kind]) {
    map.set(key, { name: trimmed, kind, hint: hint ?? existing.hint });
  }
}

/** Joueurs à la table + noms du canon narratif (PNJ, titres) pour les mentions @. */
export function buildMentionCandidates(
  roomId: string,
  actorPlayerId: string
): MentionCandidate[] {
  const map = new Map<string, MentionCandidate>();
  const canon = buildEstablishedCanonSummary(roomId);
  const sceneLoc = getSceneState(roomId)?.location?.trim() ?? "";
  const tableHint = sceneLoc ? formatLieuHint(sceneLoc) : "À la table";
  const encounterLocs = buildEncounterLocationMap(roomId);

  for (const p of listPlayers(roomId)) {
    if (p.id === actorPlayerId) continue;
    if (p.circleStatus === "withdrawn") continue;
    if (!isCompanionNarrativelyActive(p)) continue;

    const kind = p.kind === "human" ? "player" : "companion";
    const near = encounterLocs.get(normKey(p.name));
    const hint =
      near != null
        ? formatLieuHint(near)
        : p.kind === "human"
          ? tableHint
          : p.characterSheet.rank?.trim()
            ? `Compagnon · ${p.characterSheet.rank.trim()}`
            : tableHint;
    addCandidate(map, p.name, kind, hint);
  }

  for (const name of canon.properNouns) {
    const near =
      encounterLocs.get(normKey(name)) ??
      (sceneLoc && findPlaceNearName(
        listMessages(roomId)
          .filter((m) => m.kind === "mj")
          .slice(-5)
          .map((m) => m.content)
          .join("\n"),
        name
      )) ??
      sceneLoc;
    addCandidate(
      map,
      name,
      "character",
      near ? formatLieuHint(near) : "Lieu du récit"
    );
  }

  for (const title of canon.titlesAndRoles) {
    const label = title.charAt(0).toUpperCase() + title.slice(1);
    const near = encounterLocs.get(normKey(label)) ?? encounterLocs.get(normKey(title));
    addCandidate(
      map,
      label,
      "character",
      near ? formatLieuHint(near) : sceneLoc ? formatLieuHint(sceneLoc) : "Lieu du récit"
    );
  }

  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
  );
}
