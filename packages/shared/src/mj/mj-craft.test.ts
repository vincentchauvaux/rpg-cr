import assert from "node:assert/strict";
import { test } from "node:test";
import { MJ_CRAFT_RULES, MJ_CRAFT_RULES_COMPACT } from "./mj-craft.js";
import { MJ_SYSTEM_PROMPT, MJ_SYSTEM_PROMPT_COMPACT } from "./system-prompt.js";

test("la maîtrise parle en écrivain, pas en règlement", () => {
  assert.match(MJ_CRAFT_RULES, /garant de l'histoire/);
  assert.match(MJ_CRAFT_RULES, /monde, pas le chemin/i);
  assert.match(MJ_CRAFT_RULES, /dit dans le monde/);
  assert.match(MJ_CRAFT_RULES, /tu prends/);
  assert.match(MJ_CRAFT_RULES, /Règle des deux/);
  assert.match(MJ_CRAFT_RULES, /Un sens en plus de la vue/);
  assert.match(MJ_CRAFT_RULES, /Oui, et/);
  assert.match(MJ_CRAFT_RULES, /In medias res/);
  assert.match(MJ_CRAFT_RULES, /monde tourne/i);
  assert.doesNotMatch(MJ_CRAFT_RULES, /Spotify|YouTube|Pinterest|X card|Ghibli|Witcher/i);
});

test("le prompt MJ injecte la maîtrise", () => {
  assert.match(MJ_SYSTEM_PROMPT, /Maîtrise \(écrivain/);
  assert.match(MJ_SYSTEM_PROMPT, /dit dans le monde/);
  assert.match(MJ_SYSTEM_PROMPT_COMPACT, /Monde vivant, pas un rail/);
  assert.match(MJ_CRAFT_RULES_COMPACT, /deux.*traits/i);
  assert.match(MJ_CRAFT_RULES_COMPACT, /oui, et/i);
});
