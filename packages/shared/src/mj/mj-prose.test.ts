import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MJ_PROSE_DEFAULT,
  formatMjProseRules,
  mjProseBand,
  mjProseLabel,
  normalizeMjProse,
  openingTooManyPlaces,
  openingTooOrnate,
} from "./mj-prose.js";

test("prose : défaut factuel, bandes", () => {
  assert.equal(normalizeMjProse(undefined), MJ_PROSE_DEFAULT);
  assert.equal(mjProseBand(20), "blunt");
  assert.equal(mjProseBand(50), "sober");
  assert.equal(mjProseBand(80), "lush");
  assert.equal(mjProseLabel(20), "Droit au but");
});

test("prose : consignes droit au but interdisent les métaphores", () => {
  const rules = formatMjProseRules(15);
  assert.match(rules, /Droit au but/);
  assert.match(rules, /Sir Aldric/);
});

test("ouverture trop ornée en mode factuel", () => {
  const poetic =
    "La nuit est fraîche. Un murmure se fait entendre comme si les murs parlaient. " +
    "Les ombres dansantes et un parfum de bois. La brume vibre. Un cœur qui bat.";
  assert.equal(openingTooOrnate(poetic, 20), true);
  assert.equal(openingTooOrnate("Tu es à l'auberge. Un homme crie dehors. Que fais-tu ?", 20), false);
  assert.equal(openingTooOrnate(poetic, 90), false);
});

test("ouverture trop de lieux en mode factuel", () => {
  const many =
    "Tu quittes l'auberge, traverses le marché, puis la chapelle et la rivière.";
  assert.equal(openingTooManyPlaces(many, 20), true);
  assert.equal(openingTooManyPlaces("Tu es à l'auberge. Un homme entre.", 20), false);
});
