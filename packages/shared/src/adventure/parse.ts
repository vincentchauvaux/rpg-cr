import { ADVENTURE_SCHEMA, type Adventure, type AdventureNow } from "./types.js";

function rec<T>(raw: unknown): Record<string, T> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, T>;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function list(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x)).filter(Boolean);
}

function asReveal(v: unknown): import("./types.js").AdventureReveal {
  const s = str(v);
  if (s === "established" || s === "hidden" || s === "sheet") return s;
  return "public";
}

export function emptyAdventureNow(): AdventureNow {
  return { nodeId: "", establishedFactIds: [], unlockedSecretIds: [] };
}

export function isAdventure(raw: unknown): raw is Adventure {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return o.schema === ADVENTURE_SCHEMA && typeof o.now === "object" && o.now != null;
}

/** Accepte un JSON partiel ; complète les maps vides. Ne jette pas. */
export function normalizeAdventure(raw: unknown, fallbackId = "aventure"): Adventure {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const nowRaw = rec<unknown>(o.now);
  const toneRaw = rec<unknown>(o.tone);
  return {
    schema: ADVENTURE_SCHEMA,
    id: str(o.id) || fallbackId,
    title: str(o.title) || fallbackId,
    premise: str(o.premise),
    worldSeed: str(o.worldSeed),
    tone: {
      genre: list(toneRaw.genre).length ? list(toneRaw.genre) : ["fantasy"],
      taboos: list(toneRaw.taboos),
      scale:
        toneRaw.scale === "realm" || toneRaw.scale === "planar" || toneRaw.scale === "local"
          ? toneRaw.scale
          : "intimate",
    },
    restrictions: list(o.restrictions),
    now: {
      nodeId: str(nowRaw.nodeId),
      placeId: str(nowRaw.placeId) || undefined,
      timeOfDay: str(nowRaw.timeOfDay) || undefined,
      weather: str(nowRaw.weather) || undefined,
      tension:
        typeof nowRaw.tension === "number" && Number.isFinite(nowRaw.tension)
          ? nowRaw.tension
          : undefined,
      lastBeat: str(nowRaw.lastBeat) || undefined,
      establishedFactIds: list(nowRaw.establishedFactIds),
      unlockedSecretIds: list(nowRaw.unlockedSecretIds),
    },
    places: rec(o.places),
    nodes: rec(o.nodes),
    cast: rec(o.cast),
    facts: Array.isArray(o.facts) ? (o.facts as Adventure["facts"]) : [],
    secrets: Array.isArray(o.secrets) ? (o.secrets as Adventure["secrets"]) : [],
    clocks: Array.isArray(o.clocks) ? (o.clocks as Adventure["clocks"]) : [],
    quests: Array.isArray(o.quests) ? (o.quests as Adventure["quests"]) : [],
    items: rec(o.items),
    creatures: rec(o.creatures),
    factions: rec(o.factions),
    modules: o.modules && typeof o.modules === "object" ? (o.modules as Adventure["modules"]) : {},
    calendar:
      o.calendar && typeof o.calendar === "object"
        ? (o.calendar as Adventure["calendar"])
        : undefined,
  };
}

export function parseAdventureJson(raw: string | unknown): Adventure | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      data = JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (!isAdventure(data) && !(data && typeof data === "object")) return null;
  const adv = normalizeAdventure(data);
  if (!adv.id) return null;
  return adv;
}

export function defaultRestrictions(): string[] {
  return [
    "Un seul lieu à la fois.",
    "Pas de PNJ nommé hors fiche / hors cast établi.",
    "Pas de secret familial, dette d'hier, ni quête d'inconnu (parchemin, sac perdu) sauf si c'est un fait established.",
    "Ne pas écrire la réplique du PJ.",
    "Pas de menu 1/2/3 — une relance in-world.",
    "Figurant = rôle (« la tenancière »), pas un nom propre.",
  ];
}

export { asReveal };
