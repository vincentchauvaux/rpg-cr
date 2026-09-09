import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findMentionedCandidates,
  findMentionedNpcs,
  type MentionCandidate,
} from "./mention-suggestions.js";
import { buildPlayerSayNpcNarration } from "./mj/narration/builders/player-say-npc.js";
import { shouldSkipAutoMjForPlayerBanter } from "./mj/player-banter.js";

const candidates: MentionCandidate[] = [
  { name: "Mira", kind: "player" },
  { name: "Garde du pont", kind: "character" },
  { name: "Garde", kind: "character" },
  { name: "Borin", kind: "companion" },
];

test("findMentionedNpcs ignore un @PJ et retient un @PNJ", () => {
  const npcs = findMentionedNpcs("Hé @Mira, et toi @Borin tu bois ?", candidates);
  assert.deepEqual(
    npcs.map((c) => c.name),
    ["Borin"]
  );
});

test("findMentionedCandidates préfère le nom le plus long", () => {
  const mentioned = findMentionedCandidates(
    "@Garde du pont, une question.",
    candidates
  );
  assert.deepEqual(
    mentioned.map((c) => c.name),
    ["Garde du pont"]
  );
});

test("findMentionedNpcs accepte un @ collé au nom", () => {
  const npcs = findMentionedNpcs("@Borin, tu m'entends ?", candidates);
  assert.equal(npcs[0]?.name, "Borin");
});

test("banter : un @PNJ ne saute pas le tour MJ", () => {
  const skip = shouldSkipAutoMjForPlayerBanter(
    "@Borin tu as vu ça ?",
    "say",
    { id: "p1", kind: "human" },
    {
      players: [
        { id: "p1", kind: "human", characterStatus: "ready", introducedInStory: true },
        { id: "p2", kind: "human", characterStatus: "ready", introducedInStory: true },
      ],
      recentMessages: [
        { kind: "say", playerId: "p2", content: "Salut" },
        { kind: "say", playerId: "p1", content: "@Borin tu as vu ça ?" },
      ],
      addressedNpcNames: ["Borin"],
    }
  );
  assert.equal(skip, false);
});

test("prompt Dire+PNJ autorise un silence in-character", () => {
  const prompt = buildPlayerSayNpcNarration({
    kind: "player_say_npc",
    playerName: "Thorin",
    actionText: "@Borin où est la relique ?",
    addressedNpcNames: ["Borin"],
  });
  assert.match(prompt, /apostrophe PNJ/);
  assert.match(prompt, /ignorer/);
  assert.match(prompt, /question/i);
});
