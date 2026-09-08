import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractMjChoices,
  inferSceneCheck,
  matchChoice,
} from "./scene-choice.js";
import {
  formatSceneCheckActionMessage,
  formatSceneChoiceRoundActionMessage,
  resolveSceneCheckOutcome,
} from "./scene-check.js";

test("extractMjChoices lit la dernière liste de 2–8 options", () => {
  const md = `Un feu crépite dans la cheminée.

Que choisissez-vous d'abord ?

- Chercher des indices sur la relique dans l'auberge,
- Explorer les environs à la recherche d'éclaireurs ou d'alliés,
- Prendre la route directement vers le repaire légendaire de l'Ordre.

<!--scene:{"location":"auberge","mood":"calme","tension":20}-->`;
  const choices = extractMjChoices(md);
  assert.equal(choices.length, 3);
  assert.match(choices[0] ?? "", /Chercher des indices/);
  assert.match(choices[1] ?? "", /Explorer les environs/);
  assert.match(choices[2] ?? "", /Prendre la route/);
});

test("matchChoice ignore ponctuation et accents", () => {
  const choices = extractMjChoices(
    "- Chercher des indices,\n- Explorer les environs,"
  );
  assert.equal(
    matchChoice(choices, "Chercher des indices"),
    "Chercher des indices,"
  );
});

test("inferSceneCheck : enquête → INT, exploration → SAG, social → CHA contesté", () => {
  const search = inferSceneCheck(
    "Chercher des indices sur la relique dans l'auberge",
    0
  );
  assert.equal(search.ability, "intelligence");
  assert.equal(search.skillHint, "Investigation");
  assert.equal(search.mode, "dc");
  assert.equal(search.dc, 12);

  const explore = inferSceneCheck(
    "Explorer les environs à la recherche d'éclaireurs ou d'alliés",
    40
  );
  assert.equal(explore.ability, "sagesse");
  assert.equal(explore.mode, "dc");
  assert.equal(explore.dc, 10);

  const persuade = inferSceneCheck("Convaincre l'aubergiste de parler", -60);
  assert.equal(persuade.ability, "charisme");
  assert.equal(persuade.mode, "opposed");
  assert.equal(persuade.dc, 15);
});

test("resolveSceneCheckOutcome : DD, contesté, égalité", () => {
  const ok = resolveSceneCheckOutcome({
    actorKeptNatural: 14,
    actorModifier: 2,
    actorTotal: 16,
    dc: 12,
    mode: "dc",
    opposers: [],
  });
  assert.equal(ok.outcome, "success");

  const fail = resolveSceneCheckOutcome({
    actorKeptNatural: 3,
    actorModifier: 1,
    actorTotal: 4,
    dc: 12,
    mode: "dc",
    opposers: [],
  });
  assert.equal(fail.outcome, "failure");

  const win = resolveSceneCheckOutcome({
    actorKeptNatural: 18,
    actorModifier: 2,
    actorTotal: 20,
    dc: 12,
    mode: "opposed",
    opposers: [{ total: 11 }],
    worldTotal: 14,
  });
  assert.equal(win.outcome, "contest_win");
  assert.equal(win.oppositionTotal, 14);

  const tie = resolveSceneCheckOutcome({
    actorKeptNatural: 10,
    actorModifier: 2,
    actorTotal: 12,
    dc: 12,
    mode: "opposed",
    opposers: [],
    worldTotal: 12,
  });
  assert.equal(tie.outcome, "tie");
});

test("formatSceneCheckActionMessage contient le lancer pour le MJ", () => {
  const text = formatSceneCheckActionMessage({
    choice: "Chercher des indices",
    ability: "intelligence",
    abilityLabel: "Intelligence",
    skillHint: "Investigation",
    mode: "dc",
    dc: 12,
    spec: inferSceneCheck("Chercher des indices", 0),
    actor: {
      playerId: "a",
      playerName: "Alice",
      stance: "actor",
      ability: "intelligence",
      natural: 14,
      modifier: 2,
      total: 16,
    },
    helpers: [],
    opposers: [],
    usedAdvantage: false,
    outcome: "success",
    outcomeLine: "réussite (16 ≥ DD 12).",
  });
  assert.match(text, /\[Alice\] lance un d20/);
  assert.match(text, /Jet D&D 5e/);
  assert.match(text, /14 \+2 = 16/);
});

test("formatSceneChoiceRoundActionMessage ignore les options non retenues", () => {
  const actorBlock = {
    choice: "Prendre la route",
    ability: "sagesse" as const,
    abilityLabel: "Sagesse",
    skillHint: "Survie",
    mode: "dc" as const,
    dc: 10,
    spec: inferSceneCheck("Prendre la route", 40),
    actor: {
      playerId: "b",
      playerName: "Bob",
      stance: "actor" as const,
      ability: "sagesse" as const,
      natural: 12,
      modifier: 1,
      total: 13,
    },
    helpers: [],
    opposers: [],
    usedAdvantage: false,
    outcome: "success" as const,
    outcomeLine: "réussite (13 ≥ DD 10).",
  };
  const text = formatSceneChoiceRoundActionMessage({
    offeredChoices: [
      "Chercher des indices sur la relique dans l'auberge",
      "Prendre la route",
    ],
    actors: [actorBlock],
    passers: [{ playerId: "a", playerName: "Alice" }],
  });
  assert.match(text, /Tour de table — choix de scène/);
  assert.match(text, /\[Alice\] laisse faire/);
  assert.match(text, /Options non retenues \(ne plus les jouer\) : Chercher des indices/);
});
