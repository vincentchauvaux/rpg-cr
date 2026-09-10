import assert from "node:assert/strict";
import { test } from "node:test";
import {
  messageLooksLikeCompanionInvite,
  parseCompanionDirective,
  matchNamedAiPlayer,
  companionStanceFromLoyalty,
} from "./companion-pact.js";
import { prepareMjResponse, stripMjMetadataComments } from "./mj/mj-response-prep.js";
import { buildPlayerSayNpcNarration } from "./mj/narration/builders/player-say-npc.js";
import { buildPlayerActionNarration } from "./mj/narration/builders/player-action.js";

test("invitation in-fiction détectée", () => {
  assert.equal(messageLooksLikeCompanionInvite("Viens avec moi dans ma quête"), true);
  assert.equal(messageLooksLikeCompanionInvite("Rejoins-nous, Mira"), true);
  assert.equal(messageLooksLikeCompanionInvite("Tu bois un verre ?"), false);
});

test("parseCompanionDirective recruit / leave / betray", () => {
  const recruit = parseCompanionDirective({
    action: "recruit",
    name: "Mira",
    personality: "gourmande et goguenarde",
    bond: "une dette de bière",
    agenda: "retrouver son frère",
    loyalty: 40,
  });
  assert.equal(recruit?.action, "recruit");
  assert.equal(recruit?.name, "Mira");
  assert.equal(recruit?.loyalty, 40);

  const leave = parseCompanionDirective({ action: "leave", name: "Mira", reason: "plus d'intérêt" });
  assert.equal(leave?.action, "leave");

  const betray = parseCompanionDirective({
    action: "betray",
    name: "Mira",
    depart: true,
  });
  assert.equal(betray?.action, "betray");
  assert.equal(betray?.depart, true);
});

test("loyauté → posture", () => {
  assert.equal(companionStanceFromLoyalty(50), "ally");
  assert.equal(companionStanceFromLoyalty(10), "wary");
  assert.equal(companionStanceFromLoyalty(-40), "hostile");
});

test("matchNamedAiPlayer ignore les humains", () => {
  const players = [
    { name: "Mira", kind: "human" },
    { name: "Borin", kind: "ai_puppet" },
  ];
  assert.equal(matchNamedAiPlayer(players, "Mira"), null);
  assert.equal(matchNamedAiPlayer(players, "borin")?.name, "Borin");
});

test("prepareMjResponse retire le bloc companion du récit", () => {
  const raw =
    "Mira hoche la tête. « J'arrive. »\n\n<!--companion:{\"action\":\"recruit\",\"name\":\"Mira\",\"personality\":\"gourmande\",\"bond\":\"l'aventure\",\"agenda\":\"l'or\",\"loyalty\":35}-->";
  const prepared = prepareMjResponse(raw);
  assert.equal(prepared.content.includes("companion"), false);
  assert.equal(prepared.content.includes("J'arrive"), true);
  assert.equal(prepared.companionDirectives.length, 1);
  assert.equal(prepared.companionDirectives[0]?.name, "Mira");
  assert.equal(prepared.companionDirectives[0]?.action, "recruit");
  assert.equal(stripMjMetadataComments(raw).includes("<!--"), false);
});

test("prompt Dire+PNJ invitation compagnon", () => {
  const prompt = buildPlayerSayNpcNarration({
    kind: "player_say_npc",
    playerName: "Thorin",
    actionText: "@Borin viens avec moi dans ma quête",
    addressedNpcNames: ["Borin"],
    companionInvite: true,
  });
  assert.match(prompt, /<!--companion/);
  assert.match(prompt, /recruit/);
});

test("prompt Action invitation compagnon", () => {
  const prompt = buildPlayerActionNarration({
    kind: "player_action",
    playerName: "Thorin",
    actionText: "Je tends la main à Mira : viens avec nous",
  });
  assert.match(prompt, /<!--companion/);
});
