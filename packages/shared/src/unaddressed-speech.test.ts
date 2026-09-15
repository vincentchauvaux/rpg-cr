import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sceneLooksCrowded,
  shouldNarrateUnaddressedSay,
  buildUnaddressedSayHint,
  sayLooksDirectedAtHearers,
  extractSpokenVocative,
  sayAddressesSomeonePresent,
} from "./mj/unaddressed-speech.js";
import { buildPlayerSayNarration } from "./mj/narration/builders/player-say.js";
import { buildPlayerTableAskNarration } from "./mj/narration/builders/player-table-ask.js";
import {
  messageAsksTableOrientation,
  messageAddressesMjOrWorld,
  messageLooksLikeScaleCorrection,
  messageOffersARound,
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
  assert.match(prompt, /contenu littéral/);
});

test("vous / votre : les présents réagissent au contenu, pas à l'adresse", () => {
  assert.equal(
    sayLooksDirectedAtHearers("Il est sous votre main votre sac"),
    true
  );
  const hint = buildUnaddressedSayHint(
    ["voyageur", "compagnon"],
    false,
    "Il est sous votre main votre sac"
  );
  assert.match(hint, /contenu exact/);
  assert.match(hint, /Interdit de demander/);
});

test("« Tenancière, … ? » = parole in-world, pas question de table", () => {
  const speech = "Tenancière, le forgeron n'est pas à sa table ce matin ?";
  assert.equal(extractSpokenVocative(speech), "tenancière");
  assert.equal(sayAddressesSomeonePresent(speech), true);
  assert.equal(messageAddressesMjOrWorld(speech), false);
  assert.equal(shouldNarrateUnaddressedSay([], false, speech), true);
  const hint = buildUnaddressedSayHint([], true, speech);
  assert.match(hint, /tenancière/i);
  assert.match(hint, /répond/);
  assert.match(hint, /Interdit/);
});

test("commande à la tenancière : le hint interdit d'inverser", () => {
  const hint = buildUnaddressedSayHint(
    [],
    true,
    "Tenancière, un autre pichet ici — et dites à cet homme que sa table, c'est pas la mienne."
  );
  assert.match(hint, /tenancière/i);
  assert.match(hint, /commande/i);
});

test("apostrophe en fin de réplique et « Patron ! »", () => {
  assert.equal(
    extractSpokenVocative("Le forgeron n'est pas venu, patron ?"),
    "patron"
  );
  assert.equal(extractSpokenVocative("Hé, l'aubergiste ! deux chopes"), "l'aubergiste");
  assert.equal(extractSpokenVocative("Je regarde la salle et je me tais"), null);
  assert.equal(extractSpokenVocative("Donc on est où là ?"), null);
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

test("je n'ai parlé que de culture : recadrer, pas couronner", () => {
  assert.equal(
    messageLooksLikeScaleCorrection("Wow, je n'ai parler que de culture moi"),
    true
  );
  assert.equal(
    messageOffersARound("Moi je donne juste des infos, quelqu'un veux à boire ?"),
    true
  );
  const prompt = buildPlayerSayNarration({
    kind: "player_say",
    playerName: "Jrounch le jrunch",
    actionText: "Moi je donne juste des infos, quelqu'un veux à boire ?",
    crowdPresent: true,
  });
  assert.match(prompt, /recadre l'ampleur/);
  assert.match(prompt, /a soif/);
  assert.match(prompt, /écrire les paroles/);
});
