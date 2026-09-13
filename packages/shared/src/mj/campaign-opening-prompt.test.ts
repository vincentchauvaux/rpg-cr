import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCampaignOpeningRewritePrompt,
  isCampaignOpeningTooThin,
  isCampaignOpeningUnplayable,
  namesReferToSamePerson,
  openingInventedFamilySecret,
  openingInventedNamedNpc,
  openingTreatsHostAsNpc,
  parseCampaignOpeningPlan,
  renderFallbackOpeningNarrative,
  type CampaignOpeningPlan,
} from "./campaign-opening-prompt.js";

test("ouverture trop mince : Que feras-tu", () => {
  assert.equal(isCampaignOpeningTooThin("Que feras-tu ?"), true);
  assert.equal(
    isCampaignOpeningTooThin(
      "Tu es Timmy, sergent des gardes. Tes hommes tiennent la lisière. " +
        "Le camp de Kethune fume encore. Une tente principale béante, des cendres, " +
        "une relique disparue. L'enjeu est de retrouver ce qui a été volé avant la nuit. " +
        "Autour de toi la pente, le crépuscule, tes hommes qui attendent tes ordres. " +
        "Que fais-tu ?"
    ),
    false
  );
});

test("secours d'ouverture : le PJ n'est pas un PNJ à rejoindre", () => {
  const plan: CampaignOpeningPlan = {
    worldSummary: "Les marches de Kethune tiennent la passe.",
    mainPlot: "Retrouver la relique avant le culte.",
    startingSituation: "Le camp des gardes a brûlé à l'aube.",
    openingScene: "Devant la tente principale, encore chaude.",
    scene: { location: "Camp de Kethune", mood: "cendres et vent", tension: -20 },
  };
  const text = renderFallbackOpeningNarrative(plan, {
    roomName: "Test",
    worldSeed: "abc",
    map: null,
    hostName: "Timmy",
    hostSheet: {
      rank: "Sergent",
      servants: "huit gardes de la compagnie",
      background: "Vétéran de la passe.",
    },
  });
  assert.match(text, /Tu es Timmy, Sergent/);
  assert.match(text, /huit gardes/);
  assert.doesNotMatch(text, /Rejoins Timmy/i);
});

const THORIN_NPC_OPENING = `
La rivière qui serpente au bord du campement des Ombres se reflète dans les feux de camp.
Au centre de ce petit havre, Thorin Brume‑Fine, cuirassé et couronné de l'emblème de la Garde de l'Aube, se tient debout, son regard fixé sur la lueur rougeoyante des braises.

« Vous êtes arrivés à l'heure, » dit-il, la voix grave mais calme. « J'ai besoin d'une équipe fiable. »

Le chevalier hoche la tête, puis se tourne vers vous. « Vous avez le choix : vous pouvez suivre Thorin jusqu'au bord de la rivière. »

Thorin vous regarde, son regard déterminé comme le métal.

Que choisissez-vous d'abord ?
Inspecter la rive et repérer les traces de passage des brigands.
`.repeat(1);

test("ouverture injouable : l'hôte est narré comme un PNJ recruteur", () => {
  assert.equal(openingTreatsHostAsNpc(THORIN_NPC_OPENING, "Thorin Brume-Fine"), true);
  assert.equal(isCampaignOpeningUnplayable(THORIN_NPC_OPENING, "Thorin Brume-Fine"), true);
  assert.equal(
    openingTreatsHostAsNpc(
      "Tu es Thorin Brume-Fine. Tes hommes attendent. Un éclaireur revient de la rive. Que fais-tu ?",
      "Thorin Brume-Fine"
    ),
    false
  );
});

test("même personne malgré prénom seul ou tiret unicode", () => {
  assert.equal(namesReferToSamePerson("Thorin Brume-Fine", "Thorin Brume‑Fine"), true);
  assert.equal(namesReferToSamePerson("Thorin Brume-Fine", "Thorin"), true);
  assert.equal(namesReferToSamePerson("Thorin", "Mira"), false);
});

test("plan JSON : parse sans PNJ d'ouverture", () => {
  const raw = JSON.stringify({
    worldSummary: "Un camp au bord de la rivière.",
    mainPlot: "Récupérer le grimoire volé.",
    startingSituation: "Tu tiens le camp.",
    openingScene: "Les brigands fuient vers la rive.",
    scene: { location: "Campement des Ombres", mood: "braises", tension: -30 },
    optionalNpc: { name: "Sir Aldric", role: "chevalier", hook: "recrute" },
  });
  const plan = parseCampaignOpeningPlan(raw);
  assert.ok(plan);
  assert.equal(plan!.scene.location, "Campement des Ombres");
});

test("réécriture d'ouverture : le prompt cite le texte raté", () => {
  const plan: CampaignOpeningPlan = {
    worldSummary: "Les marches tiennent la passe.",
    mainPlot: "Retrouver la relique.",
    startingSituation: "Le camp a brûlé.",
    openingScene: "Devant la tente.",
    scene: { location: "Camp", mood: "cendres", tension: -20 },
  };
  const prompt = buildCampaignOpeningRewritePrompt(THORIN_NPC_OPENING, plan, {
    roomName: "Test",
    worldSeed: "abc",
    map: null,
    hostName: "Thorin Brume-Fine",
    hostSheet: { rank: "Chevalier" },
  });
  assert.match(prompt, /RÉÉCRITURE/);
  assert.match(prompt, /suivre Thorin/);
  assert.match(prompt, /JOUEUR/);
});

const SERA_OPENING = `
Tu es Sera Lame‑Douce, chevalier de la Couronne d’Argent, marchant dans les ruelles étroites de Murmures.
La nuit est fraîche, mais le vent qui s’échappe de la chapelle des Brumes porte un parfum de bois brûlé et des murmures lointains.
Les lanternes aux lueurs argentées projettent des ombres dansantes sur les pierres anciennes de la porte.
Tu sens l’écho d’une présence silencieuse derrière toi : Sir Aldric, Gardien de la Couronne, tient un parchemin.
Un murmure se fait entendre dans la ruelle, comme si les murs eux-mêmes cherchaient à te parler.
Sir Aldric murmure : « La vérité sur ton père se cache ici, mais elle n’est pas sans danger. »
`;

test("ouverture injouable : Sir Aldric et secret du père hors fiche", () => {
  assert.equal(openingInventedNamedNpc(SERA_OPENING, "Sera Lame-Douce", { rank: "Chevalier" }), true);
  assert.equal(openingInventedFamilySecret(SERA_OPENING, { rank: "Chevalier" }), true);
  assert.equal(
    isCampaignOpeningUnplayable(SERA_OPENING, "Sera Lame-Douce", {
      sheet: { rank: "Chevalier" },
      mjProse: 20,
    }),
    true
  );
});
