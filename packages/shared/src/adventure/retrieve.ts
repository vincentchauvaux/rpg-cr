import type {
  Adventure,
  AdventureCastMember,
  AdventureCreature,
  AdventureEvent,
  AdventureEventKind,
  AdventureFact,
  AdventureHook,
  AdventureItem,
  AdventureNode,
  AdventurePlace,
  AdventureReveal,
  AdventureSlice,
} from "./types.js";
import { ADVENTURE_SCHEMA } from "./types.js";
import { inferAdventureEventKind } from "./infer.js";
import { scoreAdventureHaystack } from "./text.js";

const PUBLIC: AdventureReveal[] = ["public", "established"];

function visible(reveal: AdventureReveal | undefined, unlocked: Set<string>, id?: string): boolean {
  const r = reveal ?? "public";
  if (r === "hidden" || r === "sheet") {
    return Boolean(id && unlocked.has(id));
  }
  return PUBLIC.includes(r);
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
}

function overlap(tags: string[] | undefined, hay: Set<string>): number {
  if (!tags?.length) return 0;
  return tags.reduce((n, t) => n + (hay.has(t.toLowerCase()) ? 1 : 0), 0);
}

function eventTags(kind: AdventureEventKind): string[] {
  switch (kind) {
    case "combat":
      return ["combat", "danger", "wound"];
    case "social":
    case "say":
      return ["social", "rumour"];
    case "inspect":
      return ["inspect", "object", "omen"];
    case "travel":
    case "enter":
    case "leave":
      return ["travel", "road", "map"];
    case "ritual":
      return ["ritual", "temple", "magic", "spirit"];
    case "rest":
      return ["haven", "inn", "camp"];
    case "use_item":
      return ["object", "item"];
    case "opening":
      return ["opening"];
    default:
      return [];
  }
}

export function resolveAdventureNode(
  adventure: Adventure,
  hint?: { nodeId?: string; placeId?: string; locationText?: string }
): AdventureNode | null {
  if (hint?.nodeId && adventure.nodes[hint.nodeId]) return adventure.nodes[hint.nodeId]!;
  const now = adventure.nodes[adventure.now.nodeId];
  if (now) return now;
  if (hint?.placeId) {
    const hit = Object.values(adventure.nodes).find((n) => n.placeId === hint.placeId);
    if (hit) return hit;
  }
  const loc = hint?.locationText?.trim();
  if (loc) {
    const byPlace = matchPlaceFromLocation(adventure, loc);
    if (byPlace) {
      const n = Object.values(adventure.nodes).find((x) => x.placeId === byPlace.id);
      if (n) return n;
    }
    const byTitle = Object.values(adventure.nodes).find(
      (n) => scoreAdventureHaystack(loc, n.title) >= 6 || scoreAdventureHaystack(loc, n.id) >= 6
    );
    if (byTitle) return byTitle;
  }
  return Object.values(adventure.nodes)[0] ?? null;
}

function needsModule(kind: AdventureEventKind, tags: Set<string>): {
  cosmology: boolean;
  magic: boolean;
  law: boolean;
  economy: boolean;
} {
  return {
    cosmology: kind === "ritual" || tags.has("temple") || tags.has("spirit"),
    magic: kind === "ritual" || tags.has("magic") || tags.has("wizard"),
    law: kind === "social" || tags.has("trouble") || tags.has("law") || tags.has("debt"),
    economy: kind === "social" || tags.has("market") || tags.has("work"),
  };
}

/**
 * Tranche utile pour UN événement — secrets verrouillés exclus, catalogues filtrés.
 */
export function selectAdventureSlice(
  adventure: Adventure,
  event: AdventureEvent
): AdventureSlice {
  const kind = event.kind || inferAdventureEventKind(event.text, "action");
  const unlocked = new Set(adventure.now.unlockedSecretIds ?? []);
  const established = new Set(adventure.now.establishedFactIds ?? []);
  const node = resolveAdventureNode(adventure, {
    nodeId: event.nodeId || adventure.now.nodeId,
    placeId: event.placeId || adventure.now.placeId,
  });
  const place: AdventurePlace | null = node
    ? adventure.places[node.placeId] ?? null
    : event.placeId
      ? adventure.places[event.placeId] ?? null
      : null;

  const hay = new Set([
    ...tokens(event.text ?? ""),
    ...eventTags(kind),
    ...(event.tags ?? []),
    ...(node?.tags ?? []),
    ...(place?.tags ?? []),
  ]);

  const presentCast: AdventureCastMember[] = (node?.presentCastIds ?? [])
    .map((id) => adventure.cast[id])
    .filter((c): c is AdventureCastMember => Boolean(c))
    .filter((c) => visible(c.reveal, unlocked, c.id))
    .slice(0, 4);

  const hooks: AdventureHook[] = (node?.hooks ?? [])
    .filter((h) => !h.spent)
    .sort((a, b) => overlap(b.tags, hay) - overlap(a.tags, hay))
    .slice(0, 3);

  const facts: AdventureFact[] = (adventure.facts ?? [])
    .filter((f) => visible(f.reveal, unlocked, f.id) || established.has(f.id))
    .filter((f) => {
      if (f.reveal === "hidden") return false;
      const here =
        (node && f.nodeIds?.includes(node.id)) ||
        (place && f.placeIds?.includes(place.id));
      if (here) return true;
      if (f.kind === "rumour" && (kind === "social" || kind === "say")) {
        return overlap(f.tags, hay) > 0;
      }
      return overlap(f.tags, hay) >= 2;
    })
    .slice(0, 6);

  const clocks = (adventure.clocks ?? [])
    .filter((c) => {
      if (node && c.nodeIds?.includes(node.id)) return true;
      return overlap(c.tags, hay) > 0;
    })
    .slice(0, 3);

  const quests = (adventure.quests ?? [])
    .filter((q) => q.status === "active" && visible(q.reveal, unlocked, q.id))
    .filter((q) => !q.nodeIds?.length || (node && q.nodeIds.includes(node.id)))
    .slice(0, 2);

  const items: AdventureItem[] = Object.values(adventure.items ?? {})
    .filter((i) => visible(i.reveal, unlocked, i.id))
    .filter((i) => {
      if (i.location === "here" || i.location === "carried") return true;
      return kind === "use_item" || kind === "inspect" || overlap(i.tags, hay) > 0;
    })
    .slice(0, 4);

  const creatures: AdventureCreature[] =
    kind === "combat" || hay.has("creature") || hay.has("danger")
      ? Object.values(adventure.creatures ?? {})
          .filter((c) => visible(c.reveal, unlocked, c.id))
          .filter((c) => overlap(c.tags, hay) > 0 || kind === "combat")
          .slice(0, 3)
      : [];

  const factions = Object.values(adventure.factions ?? {})
    .filter((f) => visible(f.reveal, unlocked, f.id))
    .filter((f) => overlap(f.tags, hay) > 0)
    .slice(0, 2);

  const want = needsModule(kind, hay);
  const mod = adventure.modules ?? {};
  const modules = {
    cosmology: want.cosmology ? mod.cosmology : undefined,
    magic: want.magic ? mod.magic : undefined,
    law: want.law ? mod.law : undefined,
    economy: want.economy ? mod.economy : undefined,
    languages:
      kind === "social" || kind === "say" ? mod.languages : undefined,
  };

  const secrets =
    event.includeUnlockedSecrets
      ? (adventure.secrets ?? []).filter((s) => unlocked.has(s.id)).slice(0, 2)
      : [];

  return {
    schema: ADVENTURE_SCHEMA,
    title: adventure.title,
    premise: adventure.premise,
    tone: adventure.tone,
    restrictions: [
      ...adventure.restrictions,
      ...(node?.taboos ?? []),
    ],
    now: { ...adventure.now, nodeId: node?.id ?? adventure.now.nodeId, placeId: place?.id },
    node,
    place,
    exits: (node?.exits ?? []).slice(0, 4),
    presentCast,
    facts,
    hooks,
    clocks,
    quests,
    items,
    creatures,
    factions,
    modules,
    calendar: adventure.calendar,
    secrets,
  };
}

export function matchPlaceFromLocation(
  adventure: Adventure,
  location: string
): AdventurePlace | null {
  const loc = location.trim();
  if (loc.length < 3) return null;
  let best: { p: AdventurePlace; score: number } | null = null;
  for (const p of Object.values(adventure.places)) {
    const score = Math.max(
      scoreAdventureHaystack(loc, p.name),
      scoreAdventureHaystack(loc, p.id) * 2
    );
    if (score >= 4 && (!best || score > best.score)) best = { p, score };
  }
  return best?.p ?? null;
}
