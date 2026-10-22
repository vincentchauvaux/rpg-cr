import assert from "node:assert/strict";
import { test } from "node:test";
import { pickHostMjPromptType } from "./host-mj-prompts.js";

test("Réclamer après ouverture = continuer, pas le récap 12k", () => {
  assert.equal(
    pickHostMjPromptType(
      { campaignOpeningDone: true, lastPreambleAt: "2026-10-22" },
      12,
      false
    ),
    "reclaim"
  );
});

test("Réclamer avant ouverture = préambule", () => {
  assert.equal(
    pickHostMjPromptType({ campaignOpeningDone: false }, 0, false),
    "preamble"
  );
});
