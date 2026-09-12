import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isCampaignOpeningTooThin,
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
