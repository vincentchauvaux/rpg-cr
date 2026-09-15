import assert from "node:assert/strict";
import { test } from "node:test";
import {
  locationSupportedByText,
  locationIsVaguerThan,
  mergeScenePatch,
  scrubScenePatchAgainstSourceText,
} from "./mj/scene-extract-prompt.js";
import { rewriteTableMetaClosers } from "./mj/sanitize-response.js";
import { formatEstablishedCanonSummary } from "./mj/canon-continuity.js";

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
