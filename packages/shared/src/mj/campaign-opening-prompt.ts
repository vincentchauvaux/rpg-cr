import type { CharacterSheet, ProceduralMap } from "../types.js";
import { formatAlignmentLabel } from "../alignment.js";
import { formatCharacterSheetForMj } from "../character-sheet.js";
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

function mapSummary(map: ProceduralMap | null, worldSeed: string): string {
  if (!map) return `Monde en gestation (graine narrative ${worldSeed}).`;
  const poi =
    map.pois.length > 0
      ? map.pois
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
function openingHardRules(host: string, location?: string): string {
  const lieu = location?.trim()
    ? `**Un seul lieu** : ${location.trim()}.`
    : "**Un seul lieu**, calé sur le brief / la fiche.";
  return [
    `${lieu} Pas d'enfilade ruelle + chapelle + pièce.`,
    `« ${host} » est le JOUEUR (tu / tes). Interdit : 3e personne, réplique de ${host}, « suivez ${host} ».`,
    "Pas de PNJ nommé hors fiche. Figurant anonyme OK.",
    "Pas de secret familial, destin ou prophétie hors fiche.",
    "Hook petit et concret (bruit, message, altercation).",
  ]
    .map((line) => `- ${line}`)
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
  const styleNote =
    mjProseBand(ctx.mjProse) === "lush"
      ? "JSON un peu plus atmosphérique autorisé."
      : "JSON factuel, sans poésie.";

  return [
    {
      role: "system",
      content: `Tu es concepteur de campagnes D&D 5e (narration uniquement, pas de jets de dés).
Tu prépares l'**Acte I** en JSON. ${styleNote}

${legacyWorldNamesGuard("fr")}
${openingHardRules(ctx.hostName)}

${buildGenerationLocaleRules(preferredLocale)}

Réponds UNIQUEMENT avec un objet JSON valide (${langNote}) :
{
  "worldSummary": "2 phrases max : le pays",
  "mainPlot": "Enjeu local (2 phrases)",
  "startingSituation": "Où est le PJ et ce qu'il fait (1 phrase)",
  "openingScene": "Un incident dans CE lieu (1 phrase)",
  "scene": { "location": "UN lieu concret", "mood": "1 détail", "tension": -20 }
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
  return (
    `[OUVERTURE DE CAMPAGNE — Acte I]\n\n` +
    `Graine : \`${ctx.worldSeed}\`.\n\n` +
    `## Table\n` +
    openingHardRules(host, plan.scene.location) +
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
        `${n}[^.!?]{0,160}\\b(se tient|s'approche|scrute|hoche la tête|se tourne vers vous|vous (regarde|lance)|dit-il|dit‑il|annonce-t-il)`,
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

/** Ouverture trop courte, menu vide, PJ=PNJ, PNJ inventé, trop de lieux, ou trop romancé. */
export function isCampaignOpeningUnplayable(
  content: string,
  hostName: string,
  opts?: { sheet?: CharacterSheet; mjProse?: number }
): boolean {
  if (isCampaignOpeningTooThin(content)) return true;
  if (openingTreatsHostAsNpc(content, hostName)) return true;
  if (openingInventedNamedNpc(content, hostName, opts?.sheet)) return true;
  if (openingInventedFamilySecret(content, opts?.sheet)) return true;
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

/** Récit de secours si le LLM ne pose pas le monde. */
export function renderFallbackOpeningNarrative(
  plan: CampaignOpeningPlan,
  ctx: CampaignOpeningContext
): string {
  const sheet = ctx.hostSheet;
  const rank = sheet.rank?.trim();
  const men = sheet.servants?.trim();
  const background = sheet.background?.trim();
  const who = rank
    ? `Tu es ${ctx.hostName}, ${rank}.`
    : `Tu es ${ctx.hostName}.`;
  const suite = men
    ? ` Tes hommes sont avec toi : ${men}.`
    : "";
  const past = background ? ` ${background.slice(0, 280)}` : "";

  return (
    `${who}${suite}${past}\n\n` +
    `${plan.startingSituation}\n\n` +
    `${plan.openingScene}\n\n` +
    `Autour de toi : **${plan.scene.location}**. ${plan.scene.mood}.\n\n` +
    `${plan.worldSummary}\n\n` +
    `Enjeu : ${plan.mainPlot}\n\n` +
    `Que fais-tu ?\n` +
    `<!--scene:{"location":${JSON.stringify(plan.scene.location)},"mood":${JSON.stringify(plan.scene.mood)},"tension":${plan.scene.tension}}-->\n` +
    `<!--arc:{"mainPlot":${JSON.stringify(plan.mainPlot)},"currentBeat":${JSON.stringify(plan.openingScene.slice(0, 200))}}-->`
  );
}
