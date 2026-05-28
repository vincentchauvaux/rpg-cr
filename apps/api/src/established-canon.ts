import { listQuests, listJournal } from "./campaign.js";
import { hasCampaignExport, readCampaignContext } from "./campaign-export.js";
import { listMessages } from "./messages.js";
import { listNarrativeFacts } from "./narrative-facts.js";
import { getSceneState } from "./room-scene.js";
import { getNarrativeArc } from "./room-narrative-arc.js";
import { getMap, getRoomById, getWorldSeed, listPlayers, getCampaignOpeningDone } from "./rooms.js";

const MESSAGE_SCAN_LIMIT = 80;
const MIN_NAME_LEN = 2;

/** Titres médiévaux à surveiller en post-contrôle. */
const ESTABLISHED_TITLE_WORDS = [
  "princesse",
  "prince",
  "roi",
  "reine",
  "duc",
  "duchesse",
  "comte",
  "comtesse",
  "baron",
  "baronne",
  "seigneur",
  "dame",
  "empereur",
  "impératrice",
  "pape",
  "archiduc",
  "marquis",
  "marquise",
] as const;

const FRENCH_STOP_CAPITALIZED = new Set([
  "Le",
  "La",
  "Les",
  "Un",
  "Une",
  "Des",
  "Du",
  "De",
  "Au",
  "Aux",
  "En",
  "Et",
  "Ou",
  "Si",
  "Ne",
  "Pas",
  "Pour",
  "Par",
  "Sur",
  "Dans",
  "Avec",
  "Sans",
  "Son",
  "Sa",
  "Ses",
  "Leur",
  "Vous",
  "Nous",
  "Il",
  "Elle",
  "Ils",
  "Elles",
  "Ce",
  "Cette",
  "Ces",
  "Mon",
  "Ma",
  "Mes",
  "Ton",
  "Ta",
  "Tes",
  "MJ",
  "DIRE",
  "ACTION",
  "VJ",
]);

export interface EstablishedCanonSummary {
  playerNames: string[];
  properNouns: string[];
  titlesAndRoles: string[];
  locations: string[];
  questTitles: string[];
  sourceNote: string;
}

function collectSourceTexts(roomId: string): string[] {
  const texts: string[] = [];
  const room = getRoomById(roomId);

  for (const p of listPlayers(roomId)) {
    if (p.name.trim()) texts.push(p.name);
    const bg = p.characterSheet.background?.trim();
    if (bg) texts.push(bg);
    const rank = p.characterSheet.rank?.trim();
    if (rank) texts.push(rank);
  }

  const map = getMap(roomId);
  if (map) {
    texts.push(...map.countries);
    for (const poi of map.pois) texts.push(poi.name);
  }

  const seed = getWorldSeed(roomId) ?? room?.mapSeed;
  if (seed) texts.push(seed);

  for (const f of listNarrativeFacts(roomId, 40)) {
    texts.push(f.summary);
  }

  const scene = getSceneState(roomId);
  if (scene?.location.trim()) texts.push(scene.location);
  if (scene?.mood.trim()) texts.push(scene.mood);

  const arc = getNarrativeArc(roomId);
  if (arc?.mainPlot.trim()) texts.push(arc.mainPlot);
  if (arc?.currentBeat.trim()) texts.push(arc.currentBeat);

  for (const q of listQuests(roomId)) {
    if (q.title.trim()) texts.push(q.title);
  }
  for (const j of listJournal(roomId).slice(-5)) {
    if (j.title.trim()) texts.push(j.title);
    if (j.body?.trim()) texts.push(j.body.slice(0, 500));
  }

  const messages = listMessages(roomId)
    .filter((m) => m.kind === "mj" || m.kind === "say" || m.kind === "chat" || m.kind === "action")
    .slice(-MESSAGE_SCAN_LIMIT);
  for (const m of messages) {
    texts.push(m.content);
    if (m.playerName && m.kind !== "mj") texts.push(m.playerName);
  }

  if (room && getCampaignOpeningDone(roomId) && hasCampaignExport(room.code)) {
    const md = readCampaignContext(room.code);
    if (md.lore.trim()) texts.push(md.lore.slice(0, 6000));
    if (md.journal.trim()) texts.push(md.journal.slice(0, 4000));
  }

  return texts.filter((t) => t.trim().length > 0);
}

/** Extrait des noms propres plausibles (mots capitalisés, hors stoplist). */
function extractProperNouns(texts: string[]): string[] {
  const found = new Set<string>();
  const re =
    /(?:^|[\s,.;:!?«"'(\[])([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸ][a-zàâäéèêëïîôùûüÿç'-]+(?:\s+(?:d'|de|du|des|la|le|l')?\s*[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸ][a-zàâäéèêëïîôùûüÿç'-]+)*)/gu;

  for (const text of texts) {
    for (const match of text.matchAll(re)) {
      const name = match[1]?.trim();
      if (!name || name.length < MIN_NAME_LEN) continue;
      if (FRENCH_STOP_CAPITALIZED.has(name)) continue;
      if (/^\d/.test(name)) continue;
      found.add(name);
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Titres avec article ou forme « titre de Nom » déjà présents dans les sources. */
function extractEstablishedTitles(texts: string[]): string[] {
  const joined = texts.join("\n").toLowerCase();
  const found = new Set<string>();

  const articleRe = new RegExp(
    `\\b(?:le|la|l'|un|une)\\s+(${ESTABLISHED_TITLE_WORDS.join("|")})\\b`,
    "gi"
  );
  for (const m of joined.matchAll(articleRe)) {
    const t = m[1]?.toLowerCase();
    if (t) found.add(t);
  }

  const ofRe = new RegExp(
    `\\b(${ESTABLISHED_TITLE_WORDS.join("|")})\\s+(?:de|du|d')\\s+([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸ][\\w'-]+)`,
    "gi"
  );
  for (const m of texts.join("\n").matchAll(ofRe)) {
    const title = m[1]?.toLowerCase();
    const name = m[2];
    if (title && name) found.add(`${title} de ${name}`);
  }

  return [...found].sort((a, b) => a.localeCompare(b, "fr"));
}

function extractLocationHints(texts: string[], sceneLocation: string | null): string[] {
  const locs = new Set<string>();
  if (sceneLocation?.trim()) locs.add(sceneLocation.trim());

  const lieuRe = /\b(?:lieu|à|au|aux|dans)\s+([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸ][\w\s'-]{2,40})/gi;
  for (const text of texts) {
    for (const m of text.matchAll(lieuRe)) {
      const place = m[1]?.trim();
      if (place && place.length >= 3) locs.add(place);
    }
  }
  return [...locs].slice(0, 12);
}

/** Agrège personnages, noms propres et titres déjà mentionnés dans le salon. */
export function buildEstablishedCanonSummary(roomId: string): EstablishedCanonSummary {
  const texts = collectSourceTexts(roomId);
  const playerNames = listPlayers(roomId)
    .filter((p) => p.circleStatus !== "withdrawn")
    .map((p) => p.name.trim())
    .filter(Boolean);

  const playerSet = new Set(playerNames.map((n) => n.toLowerCase()));
  const properNouns = extractProperNouns(texts).filter(
    (n) => !playerSet.has(n.toLowerCase())
  );
  const titlesAndRoles = extractEstablishedTitles(texts);
  const scene = getSceneState(roomId);
  const locations = extractLocationHints(texts, scene?.location ?? null);
  const questTitles = listQuests(roomId)
    .filter((q) => q.status === "active" && q.title.trim())
    .map((q) => q.title.trim());

  const msgCount = listMessages(roomId).length;
  const factCount = listNarrativeFacts(roomId, 1).length;

  return {
    playerNames,
    properNouns: properNouns.slice(0, 40),
    titlesAndRoles,
    locations,
    questTitles,
    sourceNote: `${msgCount} message(s), ${factCount > 0 ? "faits canon" : "pas encore de faits extraits"}`,
  };
}

export function formatEstablishedCanonForMj(summary: EstablishedCanonSummary): string {
  const lines: string[] = [];
  if (summary.playerNames.length) {
    lines.push(`- **PJ (noms officiels)** : ${summary.playerNames.join(", ")}`);
  }
  if (summary.properNouns.length) {
    lines.push(`- **Noms propres / PNJ mentionnés** : ${summary.properNouns.join(", ")}`);
  }
  if (summary.titlesAndRoles.length) {
    lines.push(`- **Titres et rôles déjà dits** : ${summary.titlesAndRoles.join(", ")}`);
  } else {
    lines.push(
      "- **Titres et rôles** : aucun titre (princesse, roi, reine, etc.) établi — ne pas en inventer."
    );
  }
  if (summary.locations.length) {
    lines.push(`- **Lieux** : ${summary.locations.join(" ; ")}`);
  }
  if (summary.questTitles.length) {
    lines.push(`- **Quêtes actives (titres)** : ${summary.questTitles.join(", ")}`);
  }
  if (!lines.length) {
    return "Peu d'éléments établis — reste vague sur les rôles et titres ; n'invente pas de princesse, roi ou PNJ nommé sans base.";
  }
  return `${lines.join("\n")}\n_(Sources : ${summary.sourceNote}.)_`;
}

/** Journalise en dev si le MJ utilise un titre non présent dans les sources du salon. */
export function warnCanonContinuityDrift(roomId: string, mjContent: string): void {
  if (process.env.NODE_ENV === "production") return;

  const blob = collectSourceTexts(roomId).join(" ").toLowerCase();
  const lower = mjContent.toLowerCase();

  for (const title of ESTABLISHED_TITLE_WORDS) {
    if (!lower.includes(title)) continue;
    if (blob.includes(title)) continue;
    console.warn(
      `[canon-drift] Titre ou rôle « ${title} » dans la réponse MJ sans base établie (salon ${roomId}).`
    );
  }
}
