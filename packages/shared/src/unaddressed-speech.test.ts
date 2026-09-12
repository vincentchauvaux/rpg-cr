import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sceneLooksCrowded,
  shouldNarrateUnaddressedSay,
  buildUnaddressedSayHint,
} from "./mj/unaddressed-speech.js";
import { buildPlayerSayNarration } from "./mj/narration/builders/player-say.js";
import { buildPlayerTableAskNarration } from "./mj/narration/builders/player-table-ask.js";
import {
  messageAsksTableOrientation,
  messageAddressesMjOrWorld,
} from "./mj/player-banter.js";

test("taverne = foule, forêt non", () => {
  assert.equal(sceneLooksCrowded("La taverne du Cerf"), true);
  assert.equal(sceneLooksCrowded("clairière silencieuse"), false);
});

test("un auditeur → il peut répondre", () => {
  const hint = buildUnaddressedSayHint(["Borin"], false);
  assert.match(hint, /Borin/);
  assert.match(hint, /répondre/);
  assert.equal(shouldNarrateUnaddressedSay(["Borin"], false), true);
});

test("plusieurs auditeurs → à qui je parle", () => {
  const hint = buildUnaddressedSayHint(["Mira", "Borin"], false);
  assert.match(hint, /à qui/);
  assert.match(hint, /Mira/);
});

test("foule sans nom → tenancier anonyme", () => {
  assert.equal(shouldNarrateUnaddressedSay([], true), true);
  const hint = buildUnaddressedSayHint([], true);
  assert.match(hint, /du monde/);
});

test("seul nulle part → pas de tour", () => {
  assert.equal(shouldNarrateUnaddressedSay([], false), false);
});

test("prompt Dire sans @ avec un compagnon", () => {
  const prompt = buildPlayerSayNarration({
    kind: "player_say",
    playerName: "Ysolde",
    actionText: "Tu as de la bière ?",
    nearbyListeners: ["Borin"],
    crowdPresent: false,
  });
  assert.match(prompt, /sans destinataire/);
  assert.match(prompt, /Borin/);
  assert.match(prompt, /répondre/);
});

test("Donc on est où là = question table, pas parole de taverne", () => {
  assert.equal(messageAsksTableOrientation("Donc on est où là ?"), true);
  assert.equal(messageAddressesMjOrWorld("Donc on est où là ?"), true);
  const prompt = buildPlayerTableAskNarration({
    kind: "player_table_ask",
    playerName: "Glumpentnik",
    actionText: "Donc on est où là ?",
    sceneSummary: "Cabane — devant la porte",
    recentChatSummary: "Tu es toujours devant la porte close.",
  });
  assert.match(prompt, /QUESTION TABLE/);
  assert.match(prompt, /Un seul lieu/);
  assert.doesNotMatch(prompt, /tenancier/);
});

test("où sont mes hommes / qui suis-je = orientation table", () => {
  assert.equal(
    messageAsksTableOrientation(
      "je peux savoir qui a monté cette tente ? Si j'ai des compagnons et si je suis sergent, où sont mes hommes ?"
    ),
    true
  );
  assert.equal(messageAsksTableOrientation("quel est mon but ?"), true);
});
