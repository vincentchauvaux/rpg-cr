import type { CharacterSheet, ProceduralMap } from "../types.js";
import { formatAlignmentLabel } from "../alignment.js";
import { formatCharacterSheetForMj } from "../character-sheet.js";
import { buildGenerationLocaleRules, localeLabel, normalizeLocale } from "../locale.js";
import { legacyWorldNamesGuard } from "../map/world-names.js";

export interface CampaignOpeningNpc {
  name: string;
  role: string;
  hook: string;
}

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
  optionalNpc?: CampaignOpeningNpc;
}

export interface CampaignOpeningContext {
  roomName: string;
  worldSeed: string;
  map: ProceduralMap | null;
  hostName: string;
  hostSheet: CharacterSheet;
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

const ANTI_REPEAT_RULES = `
## Interdictions (campagne NOUVELLE)
- ${legacyWorldNamesGuard("fr")}
- Ne pas réutiliser les intros typiques « ruines », « forteresse en ruine », « brume lourde sur des pierres effondrées » sauf si la carte ou la graine l'imposent clairement.
- Varier le genre de départ : marché portuaire, caravane, tribunal, atelier d'artisan, conclave, frontière, sanctuaire vivant, etc.
- Cette campagne est **unique** à la graine fournie — invente un monde et un hook originaux en t'appuyant sur les royaumes et POI de la carte ci-dessous.
`.trim();

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

  return [
    {
      role: "system",
      content: `Tu es concepteur de campagnes D&D 5e (narration uniquement, pas de jets de dés).
Tu prépares l'**Acte I — mise en place** : monde, situation de départ, intrigue principale, scène d'ouverture.

${ANTI_REPEAT_RULES}

Structure scénaristique attendue :
- **Hook** : accroche immédiate pour les joueurs
- **Incident déclencheur** : ce qui met l'aventure en mouvement
- **Enjeu** : ce qui est en jeu si les PJ échouent

${buildGenerationLocaleRules(preferredLocale)}

Réponds UNIQUEMENT avec un objet JSON valide (${langNote}) :
{
  "worldSummary": "2–3 phrases : setting unique à cette graine",
  "mainPlot": "Objectif, conflit central, enjeu (2 phrases)",
    "startingSituation": "Ce que vit le PJ hôte au début (2e personne implicite), pourquoi IL est là (1–2 phrases)",
    "openingScene": "Première scène : le PJ hôte est déjà sur place (1–2 phrases). Pas un briefing qu'il donne à « vous ».",
  "scene": { "location": "lieu concret", "mood": "ambiance sensorielle", "tension": -50 },
  "optionalNpc": { "name": "…", "role": "…", "hook": "…" }
}

tension : entier −100 (périlleux) à +100 (serein).
optionalNpc : un PNJ **distinct** de l'hôte (jamais le même nom que le PJ). Omets la clé si aucun n'est pertinent.
**Voix** : l'hôte « ${ctx.hostName} » est un **personnage joueur**. startingSituation et openingScene se vivent **à sa place** (il agit, il voit) — ce n'est pas un chevalier PNJ qui recrute une équipe.`,
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

export function parseCampaignOpeningPlan(
  raw: string,
  hostName?: string
): CampaignOpeningPlan | null {
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
    let optionalNpc: CampaignOpeningNpc | undefined;
    const npcRaw = o.optionalNpc as Record<string, unknown> | undefined;
    if (npcRaw && String(npcRaw.name ?? "").trim()) {
      const npcName = String(npcRaw.name).trim();
      if (!hostName || !namesReferToSamePerson(npcName, hostName)) {
        optionalNpc = {
          name: npcName,
          role: String(npcRaw.role ?? "").trim(),
          hook: String(npcRaw.hook ?? "").trim(),
        };
      }
    }
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
      ...(optionalNpc ? { optionalNpc } : {}),
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
  const npcBlock =
    plan.optionalNpc &&
    plan.optionalNpc.name.trim().toLowerCase() !== host.toLowerCase()
      ? `\nPNJ d'ouverture (pas le PJ) : **${plan.optionalNpc.name}** (${plan.optionalNpc.role}) — ${plan.optionalNpc.hook}`
      : "";

  return (
    `[OUVERTURE DE CAMPAGNE — Acte I]\n\n` +
    `Tu ouvres une **nouvelle** campagne D&D 5e. Graine : \`${ctx.worldSeed}\`.\n\n` +
    `## Qui est qui (non négociable)\n` +
    `- **« ${host} » est le personnage JOUEUR**, le seul héros à la table pour l'instant. Ce n'est **pas** un PNJ, pas un recruteur, pas un chevalier qui briefe « vous ».\n` +
    `- Écris **uniquement à la 2e personne** : « Tu es ${host}. Tu… Tes hommes… Que fais-tu ? »\n` +
    `- **Interdit** : raconter ${host} à la 3e personne (« ${host} se tient », « dit-il », « se tourne vers vous »).\n` +
    `- **Interdit** : une réplique de ${host} (il n'a encore rien dit à la table). Les PNJ peuvent parler ; lui, non.\n` +
    `- **Interdit** : « suivez ${host} », « rejoignez ${host} », « ${host} a besoin d'une équipe ».\n` +
    `- Exemple **correct** : « Tu es ${host}. Le camp sent la forge. Tes hommes attendent tes ordres. Un éclaireur revient : les brigands tiennent la rive. Que fais-tu ? »\n` +
    `- Exemple **interdit** : « ${host} se tient près du feu et vous dit : vous êtes arrivés, suivez-moi. »\n\n` +
    `## Brief scénariste (à incarner, ne pas lister)\n` +
    `- **Monde** : ${plan.worldSummary}\n` +
    `- **Intrigue principale** : ${plan.mainPlot}\n` +
    `- **Situation de départ** : ${plan.startingSituation}\n` +
    `- **Scène** : ${plan.openingScene}\n` +
    `- Lieu : ${plan.scene.location} | Ambiance : ${plan.scene.mood} | Tension : ${plan.scene.tension}` +
    npcBlock +
    `\n\n## Consignes de rédaction\n` +
    `- **4–6 paragraphes** en français, ton sobre ; un incident déclencheur.\n` +
    `- Si la fiche a un rang et des hommes, **ils sont avec toi** (tu donnes des ordres, tu n'es pas seul).\n` +
    `- ${legacyWorldNamesGuard("fr")}\n` +
    `- Ancre le récit aux lieux de la carte ; pas de cliché ruines/forteresse/brume par défaut.\n` +
    `- Pas de mécanique, pas de tutoriel, pas de « Thinking Process ».\n` +
    `- Termine par une question **ou** 2–3 pistes **que TU peux faire** (inspecter la rive, parler au forgeron, poster tes hommes) — jamais « suivre ${host} ».\n` +
    `- Ajoute \`<!--scene:{"location":"…","mood":"…","tension":N}\` et \`<!--arc:{"mainPlot":"…","currentBeat":"…"}\` en fin de message si pertinent.\n\n` +
    formatCharacterSheetForMj(host, ctx.hostSheet)
  );
}

export function buildCampaignOpeningRewritePrompt(
  failedContent: string,
  plan: CampaignOpeningPlan,
  ctx: CampaignOpeningContext
): string {
  const excerpt = failedContent.replace(/<!--[\s\S]*?-->/g, "").trim().slice(0, 900);
  return (
    `[OUVERTURE — RÉÉCRITURE OBLIGATOIRE]\n\n` +
    `Le texte suivant est **injouable** : il traite « ${ctx.hostName} » comme un PNJ qui recrute une équipe.\n\n` +
    `---\n${excerpt}\n---\n\n` +
    `Réécris **entièrement** l'Acte I. ${ctx.hostName} = le joueur, **tu / tes**. Aucune réplique de ${ctx.hostName}. ` +
    `Aucune phrase du type « suivez ${ctx.hostName} » ou « ${ctx.hostName} se tient / dit-il ».\n\n` +
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

/** Ouverture trop courte, menu vide, ou PJ traité comme PNJ. */
export function isCampaignOpeningUnplayable(
  content: string,
  hostName: string
): boolean {
  return isCampaignOpeningTooThin(content) || openingTreatsHostAsNpc(content, hostName);
}

/** Ouverture trop courte / menu vide (« Que feras-tu ? ») — à jeter. */
export function isCampaignOpeningTooThin(content: string): boolean {
  const t = stripOpeningComments(content);
  if (t.length < 280) return true;
  if (/^que feras[- ]tu/i.test(t) && t.length < 900) return true;
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
  const npc = plan.optionalNpc
    ? `\n\n${plan.optionalNpc.name} (${plan.optionalNpc.role}) est là : ${plan.optionalNpc.hook}`
    : "";

  return (
    `${who}${suite}${past}\n\n` +
    `${plan.startingSituation}\n\n` +
    `${plan.openingScene}\n\n` +
    `Autour de toi : **${plan.scene.location}**. ${plan.scene.mood}.\n\n` +
    `${plan.worldSummary}\n\n` +
    `Enjeu : ${plan.mainPlot}${npc}\n\n` +
    `Que fais-tu ?\n` +
    `<!--scene:{"location":${JSON.stringify(plan.scene.location)},"mood":${JSON.stringify(plan.scene.mood)},"tension":${plan.scene.tension}}-->\n` +
    `<!--arc:{"mainPlot":${JSON.stringify(plan.mainPlot)},"currentBeat":${JSON.stringify(plan.openingScene.slice(0, 200))}}-->`
  );
}
