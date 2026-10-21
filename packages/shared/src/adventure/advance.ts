import type {
  Adventure,
  AdventureEventKind,
  AdventureFact,
  AdventureNode,
  AdventurePlace,
} from "./types.js";
import { inferAdventureEventKind } from "./infer.js";
import { foldAdventureText, scoreAdventureHaystack } from "./text.js";
import { matchPlaceFromLocation } from "./retrieve.js";

export type AdvanceAdventureHint = {
  kind?: AdventureEventKind;
  text?: string;
  location?: string;
  lastBeat?: string;
  timeOfDay?: string;
  weather?: string;
  tension?: number;
  mjText?: string;
};

const MOVE_KINDS = new Set<AdventureEventKind>([
  "enter",
  "leave",
  "travel",
]);

function cloneAdventure(adventure: Adventure): Adventure {
  return JSON.parse(JSON.stringify(adventure)) as Adventure;
}

function haystack(hint: AdvanceAdventureHint): string {
  return [hint.text, hint.location, hint.mjText].filter(Boolean).join("\n");
}

function moveHay(hint: AdvanceAdventureHint): string {
  return [hint.text, hint.location].filter(Boolean).join("\n");
}

function slug(s: string): string {
  return (
    foldAdventureText(s)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "lieu"
  );
}

function currentNode(adventure: Adventure): AdventureNode | null {
  return adventure.nodes[adventure.now.nodeId] ?? null;
}

export function matchExitFromText(
  node: AdventureNode,
  adventure: Adventure,
  hay: string
): AdventureNode | null {
  let best: { node: AdventureNode; score: number } | null = null;
  for (const ex of node.exits ?? []) {
    const dest = adventure.nodes[ex.nodeId];
    if (!dest) continue;
    const score =
      scoreAdventureHaystack(hay, ex.label) * 3 +
      scoreAdventureHaystack(hay, dest.title) * 2 +
      scoreAdventureHaystack(hay, dest.id);
    if (score >= 6 && (!best || score > best.score)) best = { node: dest, score };
  }
  return best?.node ?? null;
}

function rankLeave(kind: AdventureNode["kind"]): number {
  if (kind === "threshold" || kind === "street" || kind === "road") return 0;
  if (kind === "wilderness" || kind === "water") return 1;
  return 2;
}

function rankEnter(kind: AdventureNode["kind"]): number {
  if (kind === "haven" || kind === "home" || kind === "court" || kind === "temple" || kind === "workshop") {
    return 0;
  }
  if (kind === "threshold") return 1;
  return 2;
}

function pickExitByRank(
  node: AdventureNode,
  adventure: Adventure,
  rank: (kind: AdventureNode["kind"]) => number
): AdventureNode | null {
  const ranked = (node.exits ?? [])
    .map((e) => adventure.nodes[e.nodeId])
    .filter((n): n is AdventureNode => Boolean(n))
    .sort((a, b) => rank(a.kind) - rank(b.kind));
  return ranked[0] ?? null;
}

export function findNodeForLocation(
  adventure: Adventure,
  location: string
): AdventureNode | null {
  const loc = location.trim();
  if (loc.length < 3) return null;
  const place = matchPlaceFromLocation(adventure, loc);
  if (place) {
    const inPlace = Object.values(adventure.nodes).filter((n) => n.placeId === place.id);
    const byTitle = inPlace
      .map((n) => ({ n, score: scoreAdventureHaystack(loc, n.title) }))
      .sort((a, b) => b.score - a.score)[0];
    if (byTitle && byTitle.score >= 4) return byTitle.n;
    if (inPlace[0]) return inPlace[0];
  }
  let best: { n: AdventureNode; score: number } | null = null;
  for (const n of Object.values(adventure.nodes)) {
    const score = Math.max(
      scoreAdventureHaystack(loc, n.title),
      scoreAdventureHaystack(loc, n.id)
    );
    if (score >= 6 && (!best || score > best.score)) best = { n, score };
  }
  return best?.n ?? null;
}

export function ensureNodeForPlace(
  adventure: Adventure,
  place: AdventurePlace
): AdventureNode {
  const existing = Object.values(adventure.nodes).find((n) => n.placeId === place.id);
  if (existing) return existing;
  const id = `${place.id}.arrivee`;
  const fromId = adventure.now.nodeId;
  const node: AdventureNode = {
    id,
    placeId: place.id,
    kind: place.kind ?? "other",
    title: place.name,
    youAre: `Tu es à ${place.name} — seulement parce que tu y es venu.`,
    tags: place.tags ?? ["travel"],
    exits: fromId ? [{ nodeId: fromId, label: "Revenir", effort: "walk" }] : [],
  };
  adventure.nodes[id] = node;
  const from = adventure.nodes[fromId];
  if (from && !(from.exits ?? []).some((e) => e.nodeId === id)) {
    from.exits = [...(from.exits ?? []), { nodeId: id, label: place.name, effort: "walk" }];
  }
  return node;
}

/**
 * Prochain nœud (aperçu) — ne crée pas de lieu. « je sors » prend une sortie.
 */
export function pickNextAdventureNode(
  adventure: Adventure,
  hint: AdvanceAdventureHint
): AdventureNode | null {
  const current = currentNode(adventure);
  const playerText = hint.text?.trim() ?? "";
  const kind =
    hint.kind ??
    inferAdventureEventKind(
      playerText.length > 400 ? "" : playerText,
      "action",
      current
    );
  const hay = moveHay(hint);

  if (kind === "opening" || kind === "recap" || kind === "scene_check") {
    if (hint.location?.trim()) {
      return findNodeForLocation(adventure, hint.location) ?? current;
    }
    return current;
  }

  if (current) {
    const named = matchExitFromText(current, adventure, hay);
    if (named) return named;
  }

  if ((kind === "travel" || kind === "enter") && playerText) {
    const namedPlace = findNodeForLocation(adventure, playerText);
    if (namedPlace && namedPlace.id !== current?.id) return namedPlace;
  }

  if (hint.location?.trim()) {
    const found = findNodeForLocation(adventure, hint.location);
    if (found) {
      if (!current || found.placeId !== current.placeId || MOVE_KINDS.has(kind)) {
        return found;
      }
    }
  }

  if (current && kind === "leave") {
    return pickExitByRank(current, adventure, rankLeave) ?? current;
  }
  if (current && kind === "travel") {
    return (
      pickExitByRank(current, adventure, (k) =>
        k === "wilderness" || k === "road" || k === "street" ? 0 : rankLeave(k)
      ) ?? current
    );
  }
  if (current && kind === "enter") {
    return pickExitByRank(current, adventure, rankEnter) ?? current;
  }
  return current;
}

function cap(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Avance `now` : sorties, lieu de table, beat. Clone — n'écrit pas le disque.
 */
export function advanceAdventure(
  adventure: Adventure,
  hint: AdvanceAdventureHint
): { adventure: Adventure; moved: boolean } {
  const nextAdv = cloneAdventure(adventure);
  const current = currentNode(nextAdv);
  const playerText = hint.text?.trim() ?? "";
  const kind =
    hint.kind ??
    inferAdventureEventKind(
      playerText.length > 400 ? "" : playerText,
      "action",
      current
    );
  let next = pickNextAdventureNode(nextAdv, { ...hint, kind });

  if (!next && hint.location?.trim()) {
    const place = matchPlaceFromLocation(nextAdv, hint.location);
    if (place) next = ensureNodeForPlace(nextAdv, place);
  }

  const moved = Boolean(next && next.id !== nextAdv.now.nodeId);
  if (next) {
    nextAdv.now.nodeId = next.id;
    nextAdv.now.placeId = next.placeId;
  }
  if (hint.timeOfDay) nextAdv.now.timeOfDay = hint.timeOfDay;
  if (hint.weather) nextAdv.now.weather = hint.weather;
  if (hint.tension != null && Number.isFinite(hint.tension)) {
    nextAdv.now.tension = hint.tension;
  }
  const beat = cap(hint.lastBeat || hint.text || next?.title || "", 180);
  if (beat) nextAdv.now.lastBeat = beat;

  const live = next ? nextAdv.nodes[next.id] : null;
  if (live && haystack(hint)) {
    const hay = haystack(hint);
    live.hooks = (live.hooks ?? []).map((h) =>
      !h.spent && scoreAdventureHaystack(hay, h.text) >= 10 ? { ...h, spent: true } : h
    );
  }

  if (moved && next && (kind === "travel" || next.kind === "wilderness" || next.kind === "road")) {
    nextAdv.clocks = (nextAdv.clocks ?? []).map((c) => {
      const here = c.nodeIds?.includes(next.id) || c.kind === "travel" || c.kind === "weather";
      if (!here) return c;
      return { ...c, ticks: Math.min(c.max, c.ticks + 1) };
    });
  }

  if (moved && next && beat) {
    const id = `beat-${slug(next.id)}-${(nextAdv.facts?.length ?? 0) + 1}`;
    const fact: AdventureFact = {
      id,
      kind: "beat",
      text: `${next.title} — ${beat}`,
      nodeIds: [next.id],
      placeIds: [next.placeId],
      reveal: "established",
      tags: next.tags,
    };
    nextAdv.facts = [...(nextAdv.facts ?? []).slice(-23), fact];
    nextAdv.now.establishedFactIds = [
      ...(nextAdv.now.establishedFactIds ?? []),
      id,
    ].slice(-16);
  }

  return { adventure: nextAdv, moved };
}
