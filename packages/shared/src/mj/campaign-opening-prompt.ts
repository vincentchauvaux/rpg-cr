import type { CharacterSheet, ProceduralMap } from "../types.js";
import { formatAlignmentLabel } from "../alignment.js";
import {
  type BriefActivity,
  type BriefStation,
  normalizeCreationBrief,
} from "../character-brief.js";
import { formatCharacterSheetForMj, sheetFollowersForMj } from "../character-sheet.js";
import { buildGenerationLocaleRules, localeLabel, normalizeLocale } from "../locale.js";
import { legacyWorldNamesGuard } from "../map/world-names.js";
import {
  mjProseBand,
  openingTooManyPlaces,
  openingTooOrnate,
} from "./mj-prose.js";

export interface CampaignOpeningPlan {
  worldSummary: string;
  mainPlot: string;
  startingSituation: string;
  openingScene: string;
  scene: {
    location: string;
    mood: string;
    tension: number;
  };
}

export interface CampaignOpeningContext {
  roomName: string;
  worldSeed: string;
  map: ProceduralMap | null;
  hostName: string;
  hostSheet: CharacterSheet;
  mjProse?: number;
}

export interface OpeningPalette {
  when: string;
  weather: string;
  incident: string;
  place: string;
  mustName: string;
}

function seedHash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickFrom<T>(items: readonly T[], seed: string, salt: string): T {
  return items[seedHash(`${seed}:${salt}`) % items.length]!;
}

const OPENING_WHENS = [
  "fin d'après-midi",
  "aube encore grise",
  "soir de lanternes",
  "juste après la pluie",
  "heure du repas",
  "milieu de matinée",
] as const;

const OPENING_WEATHERS = [
  "L'air est tiède.",
  "Un vent sec racle les seuils.",
  "L'humidité colle aux manches.",
  "La pierre reste froide sous la main.",
  "Le soleil est bas.",
  "Une bruine fine n'a pas fini.",
] as const;

const ACTIVITY_PLACE: Record<BriefActivity, string> = {
  inn: "l'auberge",
  patrol: "la ronde",
  road: "la halte de route",
  market: "la place du marché",
  post: "ton poste",
  trouble: "un toit précaire",
  looking_work: "le seuil où l'on embauche",
};

function incidentsFor(activity?: BriefActivity, station?: BriefStation): string[] {
  const byActivity: Record<BriefActivity, string[]> = {
    inn: [
      "La tenancière essuie trop longtemps le même verre. Ton banc d'habitude n'est pas libre — ou l'est trop.",
      "Un habitué que tu vois tous les jours n'a pas repris sa place. On parle bas, d'une affaire de la maison.",
      "On te doit encore l'écot, ou une faveur : un geste trop franc le rappelle, sans te coller une mission.",
    ],
    patrol: [
      "La consigne du jour a une ligne en trop, sans signature.",
      "Le camarade qui relève d'habitude n'est pas là ; la ronde tourne comme si de rien n'était.",
      "Une porte que tu fermes chaque soir est restée entrouverte.",
    ],
    road: [
      "La halte a un feu trop petit, ou trop grand. Quelqu'un du métier a passé avant toi — pas un messager d'aventure.",
      "Ton paquet a bougé. Rien de volé à grand spectacle : juste de travers.",
      "La piste porte une ornière récente qui n'était pas là ce matin.",
    ],
    market: [
      "L'étal contre lequel tu t'adosses a un manque : une balance, une caisse, un voisin d'étal.",
      "Une dispute d'étals éclate trop près : ça concerne ton rang, pas le sac d'un inconnu.",
      "On a changé ta place, ou celle d'à côté, sans te prévenir.",
    ],
    post: [
      "Au poste, un ordre anonyme (un rôle, pas un nom hors fiche) te concerne toi, pour une tâche du jour trop précise.",
      "L'outil ou le registre que tu touches tous les jours n'est pas à sa place.",
      "On t'attendait plus tôt — ou plus tard. Le silence autour de ça est trop net.",
    ],
    trouble: [
      "On te regarde trop longtemps. Pas un héros : un débiteur, un accusé, quelqu'un qui te doit ou à qui tu dois.",
      "Une voix trop connue baisse d'un cran quand tu passes. L'affaire est la tienne, pas une guerre.",
      "Un objet à toi (ou qu'on dit à toi) traîne là où il ne devrait pas.",
    ],
    looking_work: [
      "On embauche, ou on refuse, à deux pas. La file, le silence, le regard : ça te concerne.",
      "Un contremaître anonyme a déjà dit non une fois. Aujourd'hui il hésite — trop peu pour une quête, assez pour jouer.",
      "Ton sac de route est ouvert d'un cran. Rien de magique : quelqu'un a fouillé, ou tu as mal fermé.",
    ],
  };
  const extra =
    station === "priest"
      ? ["L'office a sauté une phrase, ou une flamme. Les habitués font semblant de n'avoir rien vu."]
      : station === "guard"
        ? ["Un sceau sur la porte de faction n'est pas celui d'hier."]
        : station === "sailor"
          ? ["La corde que tu connais a un nœud de trop — ou de moins."]
          : station === "ranger"
            ? ["Le gibier d'habitude n'a pas laissé la trace attendue. Juste ça."]
            : station === "wizard"
              ? ["Ta page ou ta tablette n'est plus au même signet. Personne n'avoue."]
              : [];
  const base = activity ? byActivity[activity] : [
    "Quelque chose de ton quotidien manque à sa place, sans qu'un inconnu t'apporte une quête.",
    "Un visage connu de ton métier te fait signe pour une affaire ordinaire, trop nette pour être rien.",
  ];
  return [...base, ...extra];
}

/** Libellés techniques des anciennes cartes (« city 2 », « unknown 6 ») — jamais dans le récit. */
const PLACEHOLDER_PLACE_RE =
  /^(?:city|town|village|church|dungeon|capital|unknown|poi|ter)[\s_-]*\d*$/i;

function mapPlaceNames(map: ProceduralMap | null): string[] {
  if (!map) return [];
  return [
    ...map.pois.map((p) => p.name),
    ...map.territories.map((t) => t.name),
    ...map.countries,
  ]
    .map((n) => n.trim())
    .filter((n) => n.length > 1 && !PLACEHOLDER_PLACE_RE.test(n));
}

/** Variation déterministe : même salon = même pose, salon suivant = autre heure / autre incident. */
export function buildOpeningPalette(ctx: CampaignOpeningContext): OpeningPalette {
  const brief = normalizeCreationBrief(ctx.hostSheet.creationBrief);
  const habitat = ctx.hostSheet.habitat?.trim() ?? "";
  const names = mapPlaceNames(ctx.map);
  const mustName = names.length > 0 ? pickFrom(names, ctx.worldSeed, "place") : "";
  const place =
    (brief ? ACTIVITY_PLACE[brief.activity] : "") ||
    habitat ||
    mustName ||
    "ici";
  return {
    when: pickFrom(OPENING_WHENS, ctx.worldSeed, "when"),
    weather: pickFrom(OPENING_WEATHERS, ctx.worldSeed, "weather"),
    incident: pickFrom(incidentsFor(brief?.activity, brief?.station), ctx.worldSeed, "incident"),
    place,
    mustName,
  };
}

function paletteConstraint(pal: OpeningPalette): string {
  const nameLine = pal.mustName
    ? `Nomme **${pal.mustName}** (carte / graine) au moins une fois.`
    : "Un détail unique du lieu (objet, bruit) — pas le moule bière fraîche + bois brûlé.";
  return [
    `**Cette graine** (change à chaque salon) :`,
    `- Moment : ${pal.when}. ${pal.weather}`,
    `- Incident à incarner : ${pal.incident}`,
    `- ${nameLine}`,
  ].join("\n");
}

export function buildFallbackOpeningPlan(ctx: CampaignOpeningContext): CampaignOpeningPlan {
  const pal = buildOpeningPalette(ctx);
  return {
    worldSummary: pal.mustName
      ? `${pal.mustName}, ${pal.when}.`
      : `Ici, ${pal.when}.`,
    mainPlot: pal.incident.slice(0, 180),
    startingSituation: `Tu es déjà à ${pal.place}. ${pal.when}. ${pal.weather}`,
    openingScene: pal.incident,
    scene: {
      location: pal.place,
      mood: `${pal.when}. ${pal.weather}`.slice(0, 80),
      tension: -18,
    },
  };
}

function mapSummary(map: ProceduralMap | null, worldSeed: string): string {
  if (!map) return `Monde en gestation (graine narrative ${worldSeed}).`;
  const namedPois = map.pois.filter((p) => !PLACEHOLDER_PLACE_RE.test(p.name.trim()));
  const poi =
    namedPois.length > 0
      ? namedPois
          .slice(0, 8)
          .map((p) => `${p.name} (${p.type})`)
          .join("; ")
      : "aucun repère nommé";
  const territories =
    map.territories.length > 0
      ? map.territories
          .slice(0, 5)
          .map((t) => `${t.name} (${t.country})`)
          .join("; ")
      : "—";
  return [
    `Graine narrative : ${worldSeed}`,
    `Graine carte : ${map.seed}`,
    `Royaumes / pays : ${map.countries.join(", ")}`,
    `Territoires : ${territories}`,
    `Points d'intérêt : ${poi}`,
  ].join("\n");
}

/** Règles d'Acte I — une seule copie, plan + récit. */
function openingHardRules(host: string, location?: string, pal?: OpeningPalette): string {
  const lieu = location?.trim()
    ? `**Un seul lieu** : ${location.trim()}.`
    : "**Un seul lieu**, calé sur le brief / la fiche.";
  const paletteLines = pal ? paletteConstraint(pal).split("\n") : [];
  return [
    `${lieu} Pas d'enfilade ruelle + chapelle + pièce.`,
    `« ${host} » est le JOUEUR. Première phrase : **tu / vous**. Interdit de commencer par un figurant (« Le vieux… », « Un homme… »). Interdit : réplique de ${host}, « suivez ${host} », narrer « ${host} fait… » (toujours tu).`,
    "**Pose d'abord** (2–4 phrases) : le lieu nommé, l'heure, ce que TU fais (brief), comment le lieu vit (deux traits). **Puis** un incident petit. Ce n'est pas une fiche pays.",
    "**In medias res** : déjà dans le lieu (pas un voyage). Ça n'autorise pas de sauter la pose. Pourquoi eux, ici, maintenant — la fiche.",
    "Pas de PNJ nommé hors fiche. Figurant = rôle du quotidien (tenancière, camarade de ronde, voisin d'étal) — **pas** Maître Lien, **pas** « le vieux » messager.",
    "Pas de secret familial, destin ou prophétie hors fiche.",
    "Hook **personnel** et **petit** : ça touche sa vie (métier, dette, consigne, banc, outil). Pas une guerre au premier regard. Interdit d'inventer une quête déjà commencée (« tu m'avais promis de retrouver mon anneau »).",
    "À l'auberge / taverne : tu es **client** (banc, choppe, table). Interdit : « tu es derrière le comptoir », essuyer le bois, servir. La tenancière est un PNJ distinct — tu n'es pas elle.",
    "Le lieu **vit** (qui est là, ce qu'ils veulent) — pas une seule issue balisée.",
    "Interdit le cliché : vieux + chope/comptoir + étranger + sac / manteau sombre / « pas du village ». Interdit : parchemin crypté ; sac perdu ; larmes + brigands + récolte. Interdit : encyclopédie (**Enjeu :**, République + « un pays de… »).",
    ...paletteLines,
  ]
    .map((line) => (line.startsWith("- ") || line.startsWith("**Cette") ? line : `- ${line}`))
    .join("\n");
}

export function buildCampaignOpeningPlanMessages(
  ctx: CampaignOpeningContext,
  preferredLocale?: string
): {
  role: "system" | "user";
  content: string;
}[] {
  const align = ctx.hostSheet.alignment
    ? formatAlignmentLabel(ctx.hostSheet.alignment)
    : "non précisé";
  const loc = normalizeLocale(preferredLocale);
  const langNote = localeLabel(loc);
  const pal = buildOpeningPalette(ctx);
  const styleNote =
    mjProseBand(ctx.mjProse) === "lush"
      ? "JSON un peu plus atmosphérique autorisé."
      : "JSON factuel, sans poésie.";

  return [
    {
      role: "system",
      content: `Tu es concepteur de campagnes D&D 5e (narration uniquement, pas de jets de dés).
Tu prépares l'**Acte I** en JSON. ${styleNote}
Chaque salon a une **graine différente** : réutilise les noms de la carte et la contrainte ci-dessous. Interdit de recycler le moule taverne + vieux + étranger au sac.

${legacyWorldNamesGuard("fr")}
${openingHardRules(ctx.hostName, undefined, pal)}

${buildGenerationLocaleRules(preferredLocale)}

Réponds UNIQUEMENT avec un objet JSON valide (${langNote}) :
{
  "worldSummary": "2 phrases : comment CE lieu vit aujourd'hui (noms de la carte). Pas une fiche pays.",
  "mainPlot": "Tension locale personnelle (2 phrases, pas une guerre)",
  "startingSituation": "Tu/vous + lieu + heure + ce que le PJ fait (brief)",
  "openingScene": "Incident PETIT calé sur la contrainte de graine — pas un vieux au comptoir, pas un sac d'inconnu",
  "scene": { "location": "UN lieu concret", "mood": "heure + un trait", "tension": 10 }
}

tension : entier −100 à +100.`,
    },
    {
      role: "user",
      content: [
        `Salon : « ${ctx.roomName} »`,
        mapSummary(ctx.map, ctx.worldSeed),
        `Hôte : ${ctx.hostName} (alignement ${align})`,
        formatCharacterSheetForMj(ctx.hostName, ctx.hostSheet),
      ].join("\n\n"),
    },
  ];
}

export function parseCampaignOpeningPlan(raw: string): CampaignOpeningPlan | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as Record<string, unknown>;
    const sceneRaw = o.scene as Record<string, unknown> | undefined;
    const location = String(sceneRaw?.location ?? "").trim();
    const mood = String(sceneRaw?.mood ?? "").trim();
    const tension = Number(sceneRaw?.tension ?? 0);
    const worldSummary = String(o.worldSummary ?? "").trim();
    const mainPlot = String(o.mainPlot ?? "").trim();
    const startingSituation = String(o.startingSituation ?? "").trim();
    const openingScene = String(o.openingScene ?? "").trim();
    if (!worldSummary || !mainPlot || !location) return null;
    return {
      worldSummary,
      mainPlot,
      startingSituation: startingSituation || openingScene,
      openingScene: openingScene || startingSituation,
      scene: {
        location,
        mood: mood || "—",
        tension: Number.isFinite(tension) ? tension : -15,
      },
    };
  } catch {
    return null;
  }
}

export function buildCampaignOpeningNarrativePrompt(
  plan: CampaignOpeningPlan,
  ctx: CampaignOpeningContext
): string {
  const host = ctx.hostName.trim();
  const pal = buildOpeningPalette(ctx);
  return (
    `[OUVERTURE DE CAMPAGNE — Acte I]\n\n` +
    `Graine : \`${ctx.worldSeed}\`.\n\n` +
    `## Table\n` +
    openingHardRules(host, plan.scene.location, pal) +
    `\n- Si la fiche a des hommes, ils sont avec toi (sans les nommer si la fiche ne les nomme pas).\n` +
    `- ${legacyWorldNamesGuard("fr")}\n` +
    `- Termine par une question ou 2–3 pistes **dans ce lieu**.\n` +
    `- Blocs optionnels : \`<!--scene:{"location":"…","mood":"…","tension":N}-->\` et \`<!--arc:{"mainPlot":"…","currentBeat":"…"}\`.\n\n` +
    `## À incarner\n` +
    `- Monde : ${plan.worldSummary}\n` +
    `- Intrigue : ${plan.mainPlot}\n` +
    `- Situation : ${plan.startingSituation}\n` +
    `- Scène : ${plan.openingScene}\n` +
    `- Lieu : ${plan.scene.location} | ${plan.scene.mood} | tension ${plan.scene.tension}\n\n` +
    formatCharacterSheetForMj(host, ctx.hostSheet)
  );
}

export function buildCampaignOpeningRewritePrompt(
  failedContent: string,
  plan: CampaignOpeningPlan,
  ctx: CampaignOpeningContext
): string {
  const excerpt = failedContent.replace(/<!--[\s\S]*?-->/g, "").trim().slice(0, 700);
  return (
    `[OUVERTURE — RÉÉCRITURE]\nLe texte ci-dessous est injouable. Réécris l'Acte I en respectant la table.\n\n` +
    `---\n${excerpt}\n---\n\n` +
    buildCampaignOpeningNarrativePrompt(plan, ctx)
  );
}

function stripOpeningComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePersonName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\-‑–—]+/g, " ").replace(/\s+/g, " ");
}

/** « Thorin Brume-Fine » et « Thorin » / tiret unicode = même personne. */
export function namesReferToSamePerson(a: string, b: string): boolean {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const fa = na.split(" ")[0] ?? "";
  const fb = nb.split(" ")[0] ?? "";
  if (fa.length >= 4 && fa === fb) return true;
  return na.startsWith(`${nb} `) || nb.startsWith(`${na} `);
}

/** Nom d'hôte insensible aux espaces / tirets typographiques (Brume-Fine / Brume‑Fine). */
export function hostNameMatchPattern(hostName: string): string {
  return escapeRegExp(hostName.trim()).replace(/[\s\-‑–—]+/g, "[\\s\\-‑–—]+");
}

function hostNameMatchVariants(hostName: string): string[] {
  const full = hostNameMatchPattern(hostName);
  const first = hostName.trim().split(/[\s\-‑–—]+/).filter(Boolean)[0];
  if (first && first.length >= 4) {
    const f = escapeRegExp(first);
    if (f.toLowerCase() !== full.toLowerCase()) return [full, f];
  }
  return [full];
}

/** Le MJ a mis l'hôte en PNJ recruteur (3e personne, « suivez X », « dit-il »). */
export function openingTreatsHostAsNpc(content: string, hostName: string): boolean {
  const name = hostName.trim();
  if (!name) return false;
  const t = stripOpeningComments(content);

  for (const n of hostNameMatchVariants(name)) {
    if (new RegExp(`\\b(suivre|rejoins?|rejoint|accompagne[rz]?)\\s+${n}\\b`, "iu").test(t)) {
      return true;
    }
    if (
      new RegExp(
        `${n}[^.!?]{0,160}\\b(se tient|se trouve|s'approche|scrute|hoche la tête|se tourne vers vous|vous (regarde|lance)|dit-il|dit‑il|annonce-t-il)`,
        "iu"
      ).test(t)
    ) {
      return true;
    }
    if (
      new RegExp(
        `${n}[^.!?]{0,100}\\b(a besoin d['']une équipe|vous avez tous|vous êtes arrivés)`,
        "iu"
      ).test(t)
    ) {
      return true;
    }
    if (
      new RegExp(
        `\\b(visages?|yeux|silhouettes?)\\b[^.!?]{0,60}\\bde ${n}\\b`,
        "iu"
      ).test(t)
    ) {
      return true;
    }
    if (
      new RegExp(
        `\\b${n}\\s+(doit|devra|peut)(?:\\s+[\\p{L}'’-]+){0,4}\\s+(décider|choisir|agir)\\b`,
        "iu"
      ).test(t)
    ) {
      return true;
    }
  }
  return false;
}

const TITLED_NPC_RE =
  /\b(?:Sir|Sire|Dame|Lord|Lady|Maître|Maitre|Capitaine)\s+([A-ZÉÈÀÂÎÔÛ][\p{L}'’-]+)/gu;

function sheetCanonBlob(hostName: string, sheet?: CharacterSheet): string {
  if (!sheet) return hostName;
  return [
    hostName,
    sheet.rank,
    sheet.servants,
    sheet.background,
    sheet.family,
    sheet.companionBond,
    sheet.notes,
  ]
    .filter(Boolean)
    .join(" ");
}

/** PNJ titré (Sir Aldric…) absent de la fiche. */
export function openingInventedNamedNpc(
  content: string,
  hostName: string,
  sheet?: CharacterSheet
): boolean {
  const t = stripOpeningComments(content);
  const canon = normalizePersonName(sheetCanonBlob(hostName, sheet));
  TITLED_NPC_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TITLED_NPC_RE.exec(t)) !== null) {
    const given = match[1] ?? "";
    if (!given) continue;
    if (namesReferToSamePerson(given, hostName)) continue;
    if (canon.includes(normalizePersonName(given))) continue;
    return true;
  }
  return false;
}

/** Secret familial inventé alors que la fiche n'en parle pas. */
export function openingInventedFamilySecret(
  content: string,
  sheet?: CharacterSheet
): boolean {
  const t = stripOpeningComments(content);
  if (!/vérité sur (ton|votre) père|secret (de ta|de votre) famille|destin[ée]? se cache/i.test(t)) {
    return false;
  }
  const known = `${sheet?.secret ?? ""} ${sheet?.family ?? ""} ${sheet?.background ?? ""}`;
  if (/père|pere|famille|destin/i.test(known)) return false;
  return true;
}

/** Quête d'inconnus (parchemin crypté, sac perdu…) que le joueur n'a aucune raison d'accepter. */
export function openingLooksLikeQuestMcGuffin(content: string): boolean {
  const t = stripOpeningComments(content);
  const parchment = /\b(parchemin|manuscrit|missive|papier griffonn)\b/i.test(t);
  const cryptic =
    /\b(crypt[ée]|message.{0,40}cod[ée]|phare d['’]argent|éclat de la mer|trouvez le)\b/i.test(t);
  const vanish =
    /\b(dispara[iî]t|se fond (dans|parmi)|s['’]évanouit|visage disparaissant|se fond rapidement)\b/i.test(
      t
    );
  if (parchment && (cryptic || vanish)) return true;
  if (parchment && vanish && /\b(inconnu|étranger|un homme|un vieux|vieillard)\b/i.test(t)) {
    return true;
  }
  const weirdStranger =
    /\b(homme étrange|femme étrange|n['’]était pas du village|manteau sombre)\b/i.test(t);
  const bagProp = /\b(sac|besace|provisions?)\b/i.test(t);
  if (weirdStranger && bagProp) return true;
  const strangers = /\b(voyageurs?|étrangers?|inconnus?|passants?|un homme|une femme)\b/i.test(
    t
  );
  const lostKit =
    /\b(sac|besace|provisions?|paquet|bourse)\b/i.test(t) &&
    /\b(perdu|perdue|égaré|égarée|retrouver|à la recherche)\b/i.test(t);
  const askHelp =
    /\b(votre aide|aidez[- ]nous|compter sur|besoin de (toi|vous)|on a besoin)\b/i.test(t);
  if (strangers && lostKit && askHelp) return true;
  if (/\b(nous avons perdu|ont perdu notre|perdu notre sac)\b/i.test(t) && askHelp) {
    return true;
  }
  const tears = /\b(larmes|en larmes|pleure|éplor)\b/i.test(t);
  const raiders = /\b(brigands?|bandits?)\b/i.test(t);
  const crop = /\b(blé|récolte|cargaison|champ)\b/i.test(t);
  if (tears && raiders && crop) return true;
  return false;
}

/** Colle une fiche pays / une ligne « Enjeu : » au lieu de poser le PJ. */
export function openingDumpsEncyclopedia(content: string): boolean {
  const t = stripOpeningComments(content);
  if (/\bEnjeu\s*:/i.test(t)) return true;
  if (/\b(République|royaume)\b.{0,80}\bun pays de\b/i.test(t)) return true;
  if (/\bUn conflit naissant\b/i.test(t)) return true;
  if (/\bTes hommes sont avec toi\s*:\s*Aucun\b/i.test(t)) return true;
  return false;
}

/**
 * Moule usé : le vieux au comptoir, l'étranger au sac, départ à la 3e personne.
 * (Ching : « Le vieux, sa barbe… sac de provisions… pas du village ».)
 */
export function openingLooksLikeStockHook(content: string): boolean {
  const t = stripOpeningComments(content);
  const head = t.replace(/^["«\s]+/, "").slice(0, 90);
  if (/^(Le vieux|Un vieux|Le vieillard|Un vieil homme|Un homme étrange)\b/i.test(head)) {
    return true;
  }
  const oldMan = /\b(le vieux|un vieux|le vieillard|barbe grise|sa canne)\b/i.test(t);
  const bar = /\b(chope|comptoir|bière fraîche|houblon)\b/i.test(t);
  const stranger =
    /\b(homme étrange|n['’]était pas du village|manteau sombre|pas du village)\b/i.test(t);
  const bag = /\b(sac de provisions|sac.{0,24}à la main)\b/i.test(t);
  if (oldMan && (stranger || bag)) return true;
  if (oldMan && bar && stranger) return true;
  if (stranger && bag) return true;
  return false;
}

/** La première phrase n'adresse pas le PJ : on saute la pose du lieu. */
export function openingSkipsPlaceSetup(content: string): boolean {
  const t = stripOpeningComments(content);
  const head = t.slice(0, 220);
  if (/^(Le vieux|Un vieux|Le vieillard|Un homme|Une femme|Un inconnu)\b/i.test(head.trim())) {
    return true;
  }
  return !/\b(tu |vous |tes |ton |ta |votre |vos )\b/i.test(head);
}

/** Ouverture trop courte, menu vide, PJ=PNJ, PNJ inventé, trop de lieux, McGuffin, ou trop romancé. */
export function isCampaignOpeningUnplayable(
  content: string,
  hostName: string,
  opts?: { sheet?: CharacterSheet; mjProse?: number }
): boolean {
  if (isCampaignOpeningTooThin(content)) return true;
  if (openingTreatsHostAsNpc(content, hostName)) return true;
  if (openingInventedNamedNpc(content, hostName, opts?.sheet)) return true;
  if (openingInventedFamilySecret(content, opts?.sheet)) return true;
  if (openingLooksLikeQuestMcGuffin(content)) return true;
  if (openingLooksLikeStockHook(content)) return true;
  if (openingSkipsPlaceSetup(content)) return true;
  if (openingDumpsEncyclopedia(content)) return true;
  if (openingTooManyPlaces(content, opts?.mjProse)) return true;
  if (openingTooOrnate(content, opts?.mjProse)) return true;
  return false;
}

/** Menu vide ou texte trop court pour poser une scène. */
export function isCampaignOpeningTooThin(content: string): boolean {
  const t = stripOpeningComments(content);
  if (t.length < 80) return true;
  if (/^que feras[- ]tu/i.test(t) && t.length < 400) return true;
  return false;
}

/** Récit de secours si le LLM ne pose pas le monde. Jouable : 2e personne, pose du lieu, pas d'encyclopédie. */
export function renderFallbackOpeningNarrative(
  plan: CampaignOpeningPlan,
  ctx: CampaignOpeningContext
): string {
  const pal = buildOpeningPalette(ctx);
  const sheet = ctx.hostSheet;
  const rank = sheet.rank?.trim();
  const who = rank ? `Tu es ${ctx.hostName}, ${rank}.` : `Tu es ${ctx.hostName}.`;
  const followers = sheetFollowersForMj(sheet.servants);
  const suite = followers ? ` Tes hommes sont avec toi : ${followers}.` : "";
  const location = plan.scene.location.trim() || pal.place;
  const mood = plan.scene.mood.trim();
  const start = playableOpeningBeat(plan.startingSituation, ctx);
  const scene = playableOpeningBeat(plan.openingScene, ctx);
  const beat =
    [start, scene].filter(Boolean).join(" ") || pal.incident;

  return (
    `${who}${suite}\n\n` +
    `Tu es à **${location}**, ${pal.when}. ${pal.weather}${mood ? ` ${mood}.` : ""}\n\n` +
    `${beat}\n\n` +
    `Que fais-tu ?\n` +
    `<!--scene:{"location":${JSON.stringify(plan.scene.location || location)},"mood":${JSON.stringify(mood || pal.weather)},"tension":${plan.scene.tension}}-->\n` +
    `<!--arc:{"mainPlot":${JSON.stringify(plan.mainPlot)},"currentBeat":${JSON.stringify(beat.slice(0, 200))}}-->`
  );
}

function playableOpeningBeat(text: string, ctx: CampaignOpeningContext): string {
  const t = text.trim();
  if (!t) return "";
  if (openingTreatsHostAsNpc(t, ctx.hostName)) return "";
  if (openingInventedNamedNpc(t, ctx.hostName, ctx.hostSheet)) return "";
  if (openingLooksLikeQuestMcGuffin(t)) return "";
  if (openingLooksLikeStockHook(t)) return "";
  if (openingDumpsEncyclopedia(t)) return "";
  return t;
}
