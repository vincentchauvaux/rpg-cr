import assert from "node:assert/strict";
import { test } from "node:test";
import {
  locationSupportedByText,
  locationIsVaguerThan,
  mergeScenePatch,
  scrubScenePatchAgainstSourceText,
  scrubScenePatchLocation,
} from "./mj/scene-extract-prompt.js";
import { rewriteTableMetaClosers } from "./mj/sanitize-response.js";
import { formatEstablishedCanonSummary } from "./mj/canon-continuity.js";
import { getSceneWhenDisplayLabel } from "./scene.js";
import { generateProceduralMap } from "./map/procedural.js";
import { generateProceduralSettlementName } from "./map/world-names.js";

const MJ_TEXT =
  "La tenancière, une femme au visage buriné, soupire. « Le forgeron, ça fait deux matins qu'il ne vient pas. »";

test("lieu absent du récit = invention refusée", () => {
  assert.equal(locationSupportedByText("Taverne du Coin", MJ_TEXT), false);
  assert.equal(
    scrubScenePatchAgainstSourceText(
      { location: "Taverne du Coin", mood: "suspicion légère" },
      MJ_TEXT
    ).location,
    undefined
  );
});

test("lieu présent dans le récit = accepté", () => {
  const text = "Tu pousses la porte de la grange et l'odeur de foin te saute au nez.";
  assert.equal(locationSupportedByText("Grange", text), true);
  assert.equal(
    scrubScenePatchAgainstSourceText({ location: "Grange" }, text).location,
    "Grange"
  );
});

test("« salle » ne remplace pas « Refuge du Griffon »", () => {
  assert.equal(locationIsVaguerThan("salle", "Refuge du Griffon, auberge du village"), true);
  assert.equal(
    mergeScenePatch(
      { location: "Refuge du Griffon, auberge du village", mood: "aube grise", tension: 20 },
      { location: "salle" }
    ),
    null
  );
});

test("« village » ne remplace pas « Refuge du Héros Fatigué »", () => {
  assert.equal(locationIsVaguerThan("village", "Refuge du Héros Fatigué"), true);
  assert.equal(
    mergeScenePatch(
      { location: "Refuge du Héros Fatigué", mood: "18h, l’air frais après la pluie", tension: 10 },
      { location: "village" }
    ),
    null
  );
});

test("relance méta réécrite en relance jouable", () => {
  assert.match(
    rewriteTableMetaClosers("Elle hausse les épaules. Quelles seront vos prochaines actions ?"),
    /Que fais‑tu \?$/
  );
  assert.match(
    rewriteTableMetaClosers("Quelles actions souhaitez-vous entreprendre ?"),
    /Que fais‑tu \?/
  );
});

test("le moment n'est pas répété quand l'ambiance le dit déjà", () => {
  const mood = "soir de lanternes, l’air est tiède";
  assert.equal(getSceneWhenDisplayLabel({ weather: mood }, mood), null);
  assert.equal(getSceneWhenDisplayLabel({ timeOfDay: "soir" }, mood), null);
  assert.equal(
    getSceneWhenDisplayLabel({ timeOfDay: "soir", weather: "vent" }, mood),
    "vent"
  );
  assert.equal(getSceneWhenDisplayLabel({}, mood), null);
  assert.equal(getSceneWhenDisplayLabel({ weather: "—" }, mood), null);
  assert.equal(
    getSceneWhenDisplayLabel(
      { timeOfDay: "midi", weather: "—" },
      "fin d’après‑midi, humidité collante"
    ),
    null
  );
});

test("un libellé technique de carte n'est pas un lieu de scène", () => {
  assert.equal(
    scrubScenePatchLocation({ location: "Sentier entre la capitale et city 2" }).location,
    undefined
  );
  assert.equal(
    scrubScenePatchLocation({ location: "Hameau de Rocheor" }).location,
    "Hameau de Rocheor"
  );
  assert.equal(
    scrubScenePatchLocation({ location: "Place du village" }).location,
    "Place du village"
  );
});

test("les lieux de carte ont des noms FR, pas « city 2 »", () => {
  const map = generateProceduralMap("graine-de-test");
  for (const poi of map.pois) {
    assert.doesNotMatch(
      poi.name,
      /^(?:city|town|village|church|capital|unknown)[\s_-]*\d*$/i,
      `nom technique : ${poi.name}`
    );
  }
  assert.match(
    generateProceduralSettlementName("graine-de-test", 1, "city"),
    /[A-Za-zÀ-ÿ]{3}/
  );
});

test("table solo = tutoiement imposé", () => {
  const solo = formatEstablishedCanonSummary({
    playerNames: ["Ysolde"],
    narrativeFactsBlock: "",
  });
  assert.match(solo, /Table solo/);
  assert.match(solo, /\*\*tu\*\*/);
  const duo = formatEstablishedCanonSummary({
    playerNames: ["Ysolde", "Borin"],
    narrativeFactsBlock: "",
  });
  assert.doesNotMatch(duo, /Table solo/);
});
