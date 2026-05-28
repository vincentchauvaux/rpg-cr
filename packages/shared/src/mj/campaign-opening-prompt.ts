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
  "startingSituation": "Où en sont les PJ au tout début, pourquoi ils sont là (1–2 phrases)",
  "openingScene": "Résumé de la première scène jouable (1–2 phrases)",
  "scene": { "location": "lieu concret", "mood": "ambiance sensorielle", "tension": -50 },
  "optionalNpc": { "name": "…", "role": "…", "hook": "…" }
}

tension : entier −100 (périlleux) à +100 (serein).
optionalNpc : omets la clé si aucun PNJ d'ouverture pertinent.`,
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
    let optionalNpc: CampaignOpeningNpc | undefined;
    const npcRaw = o.optionalNpc as Record<string, unknown> | undefined;
    if (npcRaw && String(npcRaw.name ?? "").trim()) {
      optionalNpc = {
        name: String(npcRaw.name).trim(),
        role: String(npcRaw.role ?? "").trim(),
        hook: String(npcRaw.hook ?? "").trim(),
      };
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
  const npcBlock = plan.optionalNpc
    ? `\nPNJ d'ouverture suggéré : **${plan.optionalNpc.name}** (${plan.optionalNpc.role}) — ${plan.optionalNpc.hook}`
    : "";

  return (
    `[OUVERTURE DE CAMPAGNE — Acte I]\n\n` +
    `Tu ouvres une **nouvelle** campagne D&D 5e pour la table. Graine narrative : \`${ctx.worldSeed}\`.\n\n` +
    `## Brief scénariste (à incarner, ne pas lister mécaniquement)\n` +
    `- **Monde** : ${plan.worldSummary}\n` +
    `- **Intrigue principale** : ${plan.mainPlot}\n` +
    `- **Situation de départ** : ${plan.startingSituation}\n` +
    `- **Scène** : ${plan.openingScene}\n` +
    `- Lieu archivé : ${plan.scene.location} | Ambiance : ${plan.scene.mood} | Tension cible : ${plan.scene.tension}` +
    npcBlock +
    `\n\n## Consignes de rédaction\n` +
    `- Rédige **4–6 paragraphes** en français : descriptions sensorielles, hook, enjeu clair, incident déclencheur léger ou menace voisine.\n` +
    `- **Présente l'hôte** « ${ctx.hostName} » dans la scène selon sa fiche (rang, background, alignement) — entrée organique, sans révéler tous ses secrets au groupe.\n` +
    `- ${legacyWorldNamesGuard("fr")}\n` +
    `- Ancre le récit aux royaumes et lieux de la carte (voir contexte plan) ; ne répète pas les clichés ruines/forteresse/brume lourde sauf si le brief l'exige.\n` +
    `- Pas de mécanique, pas de tutoriel, pas de « Thinking Process ».\n` +
    `- Termine par une question ou 2–3 pistes d'action.\n` +
    `- Ajoute \`<!--scene:{"location":"…","mood":"…","tension":N}\` et \`<!--arc:{"mainPlot":"…","currentBeat":"…"}\` en fin de message si pertinent.\n\n` +
    formatCharacterSheetForMj(ctx.hostName, ctx.hostSheet)
  );
}
