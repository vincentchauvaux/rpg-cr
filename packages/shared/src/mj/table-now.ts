import {
  extractPlaceLocationFromText,
  locationIsVaguerThan,
  locationsEquivalent,
} from "./scene-extract-prompt.js";

/** Qui a posé le lieu actuel — un déplacement déclaré par le PJ prime sur le récit. */
export type TableLocationSource = "player" | "mj" | "opening";

export interface TableNowState {
  location: string;
  people: string[];
  timeOfDay: string;
  weather: string;
  lastBeat: string;
  lastPlayerIntent: string;
  talks: string[];
  elsewhere: string[];
  locationSource: TableLocationSource;
}

export interface TableNowPatch {
  location?: string;
  people?: string[];
  timeOfDay?: string;
  weather?: string;
  lastBeat?: string;
  lastPlayerIntent?: string;
  talks?: string[];
  elsewhere?: string[];
  locationSource?: TableLocationSource;
}

export interface TableBeat {
  location: string;
  people: string[];
  timeOfDay: string;
  weather: string;
  event: string;
  talks: string[];
}

export function emptyTableNow(): TableNowState {
  return {
    location: "",
    people: [],
    timeOfDay: "",
    weather: "",
    lastBeat: "",
    lastPlayerIntent: "",
    talks: [],
    elsewhere: [],
    locationSource: "mj",
  };
}

export function parseTableNow(raw: unknown): TableNowState | null {
  if (!raw) return null;
  let o: Record<string, unknown>;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      o = JSON.parse(t) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof raw === "object") {
    o = raw as Record<string, unknown>;
  } else {
    return null;
  }
  const location = String(o.location ?? "").trim();
  const lastBeat = String(o.lastBeat ?? "").trim();
  if (!location && !lastBeat) return null;
  const source = String(o.locationSource ?? "mj");
  return {
    location,
    people: stringList(o.people),
    timeOfDay: String(o.timeOfDay ?? "").trim(),
    weather: String(o.weather ?? "").trim(),
    lastBeat,
    lastPlayerIntent: String(o.lastPlayerIntent ?? "").trim(),
    talks: stringList(o.talks),
    elsewhere: stringList(o.elsewhere),
    locationSource:
      source === "player" || source === "opening" || source === "mj" ? source : "mj",
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function uniqKeepOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 12);
}

export function isHomeLocation(location: string): boolean {
  const t = location.trim().toLowerCase();
  if (!t) return false;
  return /\b(maison|demeure|chaumière|logis|foyer|grenier|cour|ferme|chez soi|chez toi|chez vous|habitation)\b/i.test(
    t
  );
}

export function isTransientPathLocation(location: string): boolean {
  return /\b(ruelle|rue|pavé|chemin|route)\b/i.test(location);
}

/** Habitat fiche → lieu « chez soi » (pas la chambre d'auberge si le PJ rentre à la maison). */
export function homeLocationFromHabitat(habitat?: string | null): string {
  const h = habitat?.trim() ?? "";
  if (!h) return "ta maison";
  if (/\b(auberge|taverne|chambre|étal|caserne|camp de route|poste)\b/i.test(h)) {
    return "ta maison";
  }
  return h;
}

/** Chez soi seulement si c'est dit (pas le verbe « rentrer » tout seul). */
const GO_HOME_RE =
  /\b(chez moi|chez soi|chez nous|à la maison|a la maison|ma maison|me couche|aller dormir|va dormir|rentre[rz]? chez|rentré[e]? chez|rentrer à(?:\s+la)?\s+maison)\b/iu;
const GO_INSIDE_RE =
  /\b(je rentre|j['’]rentre|on rentre|rentrer|rentre|je entre|j['’]entre|entrer|entre dedans|rentre dedans)\b/iu;
const WORK_LAND_RE =
  /\b(travailler la terre|la terre dehors|aux champs|au champ|jardiner)\b/iu;
const IGNORE_HOOK_RE =
  /\b(ignor[ez]?|passe[rz]? (à|a) votre conversation|continuer (à )?boire|verre|boisson)\b/iu;
const TALK_RE =
  /\b(tavernier|aubergiste|client|voisin|passant|servante|hôte)\b/iu;

export function looksLikeGoingHome(intent: string): boolean {
  return GO_HOME_RE.test(intent);
}

/** « Je rentre » sans « chez moi » = entrer dans le bâtiment devant soi. */
export function looksLikeGoingInside(intent: string): boolean {
  if (looksLikeGoingHome(intent)) return false;
  return GO_INSIDE_RE.test(intent);
}

const BUILDING_NAME_RE =
  /\b((?:la |l['’])?(?:taverne|auberge)(?:\s+(?:du|de la|des|de l['’])[\p{L}0-9'’\- ]{1,40})?)/iu;

/**
 * Intérieur du bâtiment devant le PJ. Ne relit pas un « vous avez quitté la taverne »
 * si le lieu actuel est déjà la maison.
 */
export function nearbyInteriorFromTable(current: TableNowState | null): string | null {
  if (!current) return null;
  const loc = current.location.trim();
  const beat = current.lastBeat.trim();

  if (!loc) {
    const fromBeat = beat.match(
      /\bdevant\s+((?:la |l['’])?(?:taverne|auberge)[^.,;]{0,40})/iu
    );
    return fromBeat?.[1]?.trim() ?? null;
  }

  if (isHomeLocation(loc) && !/\b(devant|seuil|entrée|ruelle)\b/iu.test(loc)) {
    return loc;
  }

  const stripped = loc
    .replace(
      /^(?:devant|au seuil de|à l['’]?entrée de|devant la porte de)\s+/iu,
      ""
    )
    .trim();
  if (stripped && stripped.toLowerCase() !== loc.toLowerCase()) return stripped;

  if (/\b(ruelle|rue|pavé|dehors)\b/iu.test(loc)) {
    const fromLoc = loc.match(BUILDING_NAME_RE);
    if (fromLoc?.[1]) return fromLoc[1].trim();
    const fromBeat = beat.match(BUILDING_NAME_RE);
    if (fromBeat?.[1]) return fromBeat[1].trim();
    if (/\btaverne\b/iu.test(`${loc} ${beat}`)) return "la taverne";
    if (/\bauberge\b/iu.test(`${loc} ${beat}`)) return "l'auberge";
  }

  if (/\b(taverne|auberge|bar)\b/iu.test(loc)) return loc;
  return loc;
}

export function heuristicTableNowFromPlayerIntent(
  intent: string,
  current: TableNowState | null,
  habitat?: string | null
): TableNowPatch | null {
  const t = intent.trim();
  if (!t) return null;
  const patch: TableNowPatch = {
    lastPlayerIntent: t.slice(0, 240),
    locationSource: "player",
  };

  if (looksLikeGoingHome(t)) {
    patch.location = homeLocationFromHabitat(habitat);
    patch.lastBeat = "Le PJ rentre chez lui.";
    patch.people = [];
  } else if (looksLikeGoingInside(t)) {
    const dest = nearbyInteriorFromTable(current);
    if (dest) {
      patch.location = dest;
      patch.lastBeat = `Le PJ rentre dans ${dest}.`;
    } else {
      patch.lastBeat = "Le PJ rentre dans le lieu devant lui.";
    }
  } else if (WORK_LAND_RE.test(t)) {
    patch.location = isHomeLocation(current?.location ?? "")
      ? "champs près de chez toi"
      : "champs";
    patch.lastBeat = "Le PJ veut travailler la terre dehors.";
  } else if (IGNORE_HOOK_RE.test(t) && /parchemin|message|papier/i.test(current?.lastBeat ?? t)) {
    patch.elsewhere = uniqKeepOrder([
      ...(current?.elsewhere ?? []),
      "parchemin laissé là où il était",
    ]);
    patch.lastBeat = "Le PJ ignore le message et reste à sa conversation.";
  }

  const talks: string[] = [];
  const who = t.match(TALK_RE);
  if (who?.[0] && !IGNORE_HOOK_RE.test(t)) {
    talks.push(who[0].toLowerCase());
  }
  if (talks.length) patch.talks = uniqKeepOrder([...(current?.talks ?? []), ...talks]);

  return patch;
}

const TIME_HINTS: [RegExp, string][] = [
  [/\b(aube|point du jour|petit matin)\b/i, "aube"],
  [/\b(matin(?!ée)|matinée)\b/i, "matin"],
  [/\b(midi|plein jour)\b/i, "midi"],
  [/\b(après[- ]midi|après midi)\b/i, "après-midi"],
  [/\b(crépuscule|soleil couchant|dernières? lueurs|tomb[ée]e du jour)\b/i, "crépuscule"],
  [/\b(soir|soirée|vespéral)\b/i, "soir"],
  [/\b(nuit|minuit|étoiles)\b/i, "nuit"],
];

const WEATHER_HINTS: [RegExp, string][] = [
  [/\b(pluie|averse|bruine)\b/i, "pluie"],
  [/\b(orage|tonnerre)\b/i, "orage"],
  [/\b(brouillard|brume)\b/i, "brume"],
  [/\b(neige|givre)\b/i, "neige"],
  [/\b(vent|bise|brise)\b/i, "vent"],
  [/\b(air frais|frais|froideur)\b/i, "air frais"],
  [/\b(chaleur|étouffant|lourd)\b/i, "chaleur"],
  [/\b(soleil)\b/i, "soleil"],
];

export function extractTimeOfDayFromText(text: string): string | null {
  for (const [re, label] of TIME_HINTS) {
    if (re.test(text)) return label;
  }
  return null;
}

export function extractWeatherFromText(text: string): string | null {
  for (const [re, label] of WEATHER_HINTS) {
    if (re.test(text)) return label;
  }
  return null;
}

function lastNarrativeSentence(text: string): string {
  const cleaned = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[-*]\s+.+$/gm, "")
    .replace(/Que (faites|feras|souhaitez).*$/imu, "")
    .trim();
  const parts = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20);
  const last = parts.at(-1)?.trim() ?? cleaned.slice(-220).trim();
  return last.slice(0, 220);
}

export function heuristicTableNowFromMjText(
  mjText: string,
  current: TableNowState | null
): TableNowPatch | null {
  const sample = mjText.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (sample.length < 20) return null;

  const patch: TableNowPatch = {
    lastBeat: lastNarrativeSentence(sample),
    locationSource: "mj",
  };

  const extracted = extractPlaceLocationFromText(sample);
  if (extracted) {
    const stickyPlayer =
      current?.locationSource === "player" && Boolean(current.location.trim());
    const rewindToOldPath =
      isTransientPathLocation(extracted) ||
      (/\b(taverne|auberge|bar)\b/i.test(extracted) && isHomeLocation(current?.location ?? ""));
    if (stickyPlayer && rewindToOldPath && !isHomeLocation(extracted)) {
      /* le récit rejoue le trajet : on garde le lieu déclaré par le PJ */
    } else if (
      stickyPlayer &&
      isHomeLocation(current?.location ?? "") &&
      !isHomeLocation(extracted) &&
      !/champ/i.test(extracted)
    ) {
      /* inchangé */
    } else {
      patch.location = extracted;
    }
  }

  const time = extractTimeOfDayFromText(sample);
  if (time) patch.timeOfDay = time;
  const weather = extractWeatherFromText(sample);
  if (weather) patch.weather = weather;

  const people: string[] = [];
  for (const m of sample.matchAll(
    /\b(tavernier|aubergiste|luthiste|cornemuseur|voisin|servante|passant|ivrogne)\b/gi
  )) {
    if (m[0]) people.push(m[0].toLowerCase());
  }
  if (people.length) patch.people = uniqKeepOrder(people);

  if (
    /parchemin|missive|papier griffonn/i.test(sample) &&
    /comptoir|taverne|laissé/i.test(sample)
  ) {
    patch.elsewhere = uniqKeepOrder([
      ...(current?.elsewhere ?? []),
      "parchemin à la taverne",
    ]);
  }

  const hasAny =
    Boolean(patch.location) ||
    Boolean(patch.timeOfDay) ||
    Boolean(patch.weather) ||
    Boolean(patch.lastBeat) ||
    (patch.people && patch.people.length > 0) ||
    (patch.elsewhere && patch.elsewhere.length > 0);
  return hasAny ? patch : null;
}

export function mergeTableNow(
  current: TableNowState | null,
  patch: TableNowPatch
): TableNowState {
  const base = current ?? emptyTableNow();
  const proposed = (patch.location ?? "").trim();
  const keepCurrent =
    Boolean(proposed) &&
    Boolean(base.location.trim()) &&
    (locationsEquivalent(proposed, base.location) ||
      locationIsVaguerThan(proposed, base.location));
  const nextLocation = keepCurrent ? base.location : proposed || base.location;
  const locationChanged =
    Boolean(proposed) &&
    !keepCurrent &&
    !locationsEquivalent(nextLocation, base.location || nextLocation);

  return {
    location: nextLocation || base.location,
    people: patch.people ? uniqKeepOrder(patch.people) : locationChanged ? [] : base.people,
    timeOfDay: patch.timeOfDay?.trim() || base.timeOfDay,
    weather: patch.weather?.trim() || base.weather,
    lastBeat: patch.lastBeat?.trim() || base.lastBeat,
    lastPlayerIntent: patch.lastPlayerIntent?.trim() || base.lastPlayerIntent,
    talks: patch.talks ? uniqKeepOrder(patch.talks) : base.talks,
    elsewhere: patch.elsewhere ? uniqKeepOrder(patch.elsewhere) : base.elsewhere,
    locationSource: patch.locationSource ?? (locationChanged ? "mj" : base.locationSource),
  };
}

export function tableNowToBeat(state: TableNowState): TableBeat {
  return {
    location: state.location,
    people: state.people,
    timeOfDay: state.timeOfDay,
    weather: state.weather,
    event: state.lastBeat || state.lastPlayerIntent,
    talks: state.talks,
  };
}

export function formatTableNowForMj(
  state: TableNowState | null,
  recentBeats: TableBeat[] = []
): string {
  if (!state?.location?.trim() && !state?.lastBeat?.trim()) {
    return "Script de table encore vide — pose le lieu et le moment dès ce tour.";
  }
  const lines = [
    "**État actuel (source de vérité — ne pas re-narrer le trajet déjà fait)**",
    `- Lieu : ${state.location || "—"}`,
    `- Présents : ${state.people.length ? state.people.join(", ") : "le PJ (seul, sauf mention contraire)"}`,
    `- Moment : ${state.timeOfDay || "—"}`,
    `- Météo : ${state.weather || "—"}`,
    `- Dernier fait : ${state.lastBeat || "—"}`,
  ];
  if (state.lastPlayerIntent) {
    lines.push(`- Intention du PJ (à résoudre maintenant) : ${state.lastPlayerIntent}`);
    if (looksLikeGoingInside(state.lastPlayerIntent)) {
      lines.push(
        "- **Lecture** : « rentrer » sans « chez moi » = entrer dans le bâtiment du lieu actuel (taverne, auberge…), **pas** rentrer à la maison."
      );
    }
  }
  if (state.talks.length) {
    lines.push(`- Échanges déjà tenus : ${state.talks.join(" ; ")}`);
  }
  if (state.elsewhere.length) {
    lines.push(`- Ailleurs (pas ici) : ${state.elsewhere.join(" ; ")}`);
  }
  lines.push(
    "- **Interdit** de re-décrire comment le PJ est arrivé ici, ni un lieu qu'il a quitté, ni le dernier fait ci-dessus. Continue **après**."
  );
  const script = recentBeats
    .filter((b) => b.event.trim())
    .slice(-8)
    .map((b, i) => {
      const when = [b.timeOfDay, b.weather].filter(Boolean).join(", ");
      const who = b.people.length ? ` — ${b.people.join(", ")}` : "";
      return `  ${i + 1}. ${b.location || "—"}${when ? ` (${when})` : ""}${who} : ${b.event}`;
    });
  if (script.length) {
    lines.push("- Script déjà joué :");
    lines.push(...script);
  }
  return lines.join("\n");
}

export function parseTableNowPatch(raw: string): TableNowPatch | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as Record<string, unknown>;
    const patch: TableNowPatch = {};
    if (o.location) patch.location = String(o.location).trim();
    if (o.timeOfDay) patch.timeOfDay = String(o.timeOfDay).trim();
    if (o.weather) patch.weather = String(o.weather).trim();
    if (o.lastBeat) patch.lastBeat = String(o.lastBeat).trim();
    if (Array.isArray(o.people)) patch.people = stringList(o.people);
    if (Array.isArray(o.talks)) patch.talks = stringList(o.talks);
    if (Array.isArray(o.elsewhere)) patch.elsewhere = stringList(o.elsewhere);
    if (!Object.keys(patch).length) return null;
    patch.locationSource = "mj";
    return patch;
  } catch {
    return null;
  }
}

export function buildTableNowExtractMessages(
  mjText: string,
  playerIntent: string | undefined,
  current: TableNowState | null
): { role: "system" | "user"; content: string }[] {
  const archive = current
    ? `État actuel :\n${formatTableNowForMj(current)}\n\n`
    : "";
  const intent = playerIntent?.trim()
    ? `Action / parole du PJ à prendre comme vrai : « ${playerIntent.trim().slice(0, 400)} »\n`
    : "";

  return [
    {
      role: "system",
      content: `Tu es l'archiviste d'une table JDR. Tu consigne l'état **après** le récit, pas le trajet déjà narré.

Réponds UNIQUEMENT avec un JSON :
{
  "location": "lieu où le PJ est MAINTENANT (pas un lieu quitté)",
  "people": ["noms ou rôles présents ICI"],
  "timeOfDay": "aube|matin|midi|après-midi|crépuscule|soir|nuit",
  "weather": "détail météo court",
  "lastBeat": "une phrase : ce qui vient d'arriver",
  "talks": ["à qui le PJ a parlé, et le sujet"],
  "elsewhere": ["objets ou gens laissés ailleurs"]
}

Règles :
- Si le PJ a dit « rentrer chez moi / à la maison », location = sa maison / cour / champs — **pas** la taverne ni la ruelle du trajet.
- Si le PJ a dit seulement « je rentre » / « je rentre dedans » (sans chez moi) alors qu'il est devant un bâtiment, location = **l'intérieur de CE bâtiment** (taverne, auberge…) — **pas** sa maison.
- Ne recopie pas un lieu seulement mentionné comme « vous avez quitté… ».
- people = présents **maintenant**. Un inconnu déjà disparu n'est plus là.
- Omets un champ s'il est inchangé et déjà dans l'archive.`,
    },
    {
      role: "user",
      content: `${archive}${intent}Récit MJ :\n\n${mjText.slice(0, 5000)}`,
    },
  ];
}
