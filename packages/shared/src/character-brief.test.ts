import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCreationBriefToSheet,
  formatCreationBriefAsHints,
  formatCreationBriefForMj,
  isCharacterCreationBriefComplete,
  normalizeCreationBrief,
} from "./character-brief.js";

test("brief : ignore un JSON incomplet", () => {
  assert.equal(normalizeCreationBrief({ station: "guard" }), undefined);
  assert.equal(isCharacterCreationBriefComplete(undefined), false);
});

test("brief : préremplit rang et habitat sans écraser", () => {
  const brief = normalizeCreationBrief({
    station: "guard",
    activity: "patrol",
    past: "with_men",
  });
  assert.ok(brief);
  const filled = applyCreationBriefToSheet({ rank: "", habitat: "" }, brief!);
  assert.match(filled.rank ?? "", /Garde/i);
  assert.match(filled.habitat ?? "", /Caserne/i);
  assert.match(filled.servants ?? "", /hommes/i);
  const kept = applyCreationBriefToSheet({ rank: "Sergent déjà écrit" }, brief!);
  assert.equal(kept.rank, "Sergent déjà écrit");
});

test("brief : seul n'invente pas une suite « Aucun »", () => {
  const brief = normalizeCreationBrief({
    station: "peasant",
    activity: "inn",
    past: "alone",
  });
  assert.ok(brief);
  const filled = applyCreationBriefToSheet({ rank: "", habitat: "" }, brief!);
  assert.equal(filled.servants ?? "", "");
});

test("hints IA : pas de destin inventé", () => {
  const hints = formatCreationBriefAsHints({
    station: "noble",
    activity: "inn",
    past: "alone",
  });
  assert.match(hints, /père|destin/i);
});

test("brief MJ : à l'auberge = client, pas cuisine", () => {
  const text = formatCreationBriefForMj({
    station: "peasant",
    activity: "inn",
    past: "local",
  });
  assert.match(text, /client/i);
  assert.match(text, /cuisine/i);
});
