import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPlaceLocationFromText } from "./scene-extract-prompt.js";
import {
  emptyTableNow,
  formatTableNowForMj,
  heuristicTableNowFromMjText,
  heuristicTableNowFromPlayerIntent,
  homeLocationFromHabitat,
  looksLikeGoingHome,
  looksLikeGoingInside,
  mergeTableNow,
  nearbyInteriorFromTable,
  parseTableNow,
} from "./table-now.js";

test("rentrer chez soi n'est pas la chambre d'auberge", () => {
  assert.equal(looksLikeGoingHome("Je me lève et rentre chez moi"), true);
  assert.equal(homeLocationFromHabitat("Chambre d'auberge"), "ta maison");
  assert.equal(homeLocationFromHabitat("Maison au village"), "Maison au village");
});

test("intention joueur : rentrer verrouille le lieu", () => {
  const patch = heuristicTableNowFromPlayerIntent(
    "Je me lève et rentre chez moi",
    null,
    "Chambre d'auberge"
  );
  assert.equal(patch?.location, "ta maison");
  assert.equal(patch?.locationSource, "player");
});

test("lieu actuel = dernier cadre, pas la taverne quittée", () => {
  const text =
    "Vous vous levez et vous quittez la taverne du Dé Roulé. " +
    "La porte s'ouvre sur une ruelle. Une fois à l'entrée de votre maison, vous ouvrez la porte.";
  const loc = extractPlaceLocationFromText(text);
  assert.ok(loc);
  assert.match(loc, /maison/i);
});

test("le récit qui rejoue la ruelle ne déboulonne pas un PJ déjà chez lui", () => {
  const current = mergeTableNow(null, {
    location: "ta maison",
    lastBeat: "Bibhou est rentré chez lui.",
    locationSource: "player",
  });
  const mj =
    "Vous avez quitté la taverne et vous retrouvez sur la ruelle étroite, bordée de maisons de pierre. " +
    "Le soleil couchant projette des ombres. À l'horizon s'étend un champ de blé.";
  const patch = heuristicTableNowFromMjText(mj, current);
  const next = mergeTableNow(current, patch ?? {});
  assert.doesNotMatch(next.location, /taverne|ruelle/i);
  assert.equal(next.timeOfDay, "crépuscule");
});

test("formatTableNowForMj interdit de re-narrer le trajet", () => {
  const text = formatTableNowForMj({
    location: "ta maison",
    people: [],
    timeOfDay: "crépuscule",
    weather: "air frais",
    lastBeat: "Bibhou est rentré et a ouvert la porte.",
    lastPlayerIntent: "travailler un peu la terre dehors",
    talks: ["tavernier : un autre verre (pas écouté)"],
    elsewhere: ["parchemin au comptoir de la taverne"],
    locationSource: "player",
  });
  assert.match(text, /ta maison/);
  assert.match(text, /crépuscule/);
  assert.match(text, /parchemin/);
  assert.match(text, /Interdit/);
});

test("parseTableNow ignore le JSON vide", () => {
  assert.equal(parseTableNow(""), null);
  assert.ok(parseTableNow({ location: "auberge", lastBeat: "tu bois" }));
});

test("je rentre sans chez moi = entrer ici, pas rentrer à la maison", () => {
  assert.equal(looksLikeGoingHome("je rentre"), false);
  assert.equal(looksLikeGoingInside("je rentre"), true);
  assert.equal(looksLikeGoingHome("Je rentre chez moi"), true);
  assert.equal(looksLikeGoingInside("Je rentre chez moi"), false);

  const current = mergeTableNow(emptyTableNow(), {
    location: "devant la taverne du Dé Roulé",
    lastBeat: "Vous venez de chez vous et vous êtes devant la taverne.",
    locationSource: "mj",
  });
  assert.match(nearbyInteriorFromTable(current) ?? "", /taverne/i);

  const patch = heuristicTableNowFromPlayerIntent(
    "je rentre",
    current,
    "Maison au village"
  );
  assert.match(patch?.location ?? "", /taverne/i);
  assert.doesNotMatch(patch?.location ?? "", /maison/i);
  assert.match(patch?.lastBeat ?? "", /taverne/i);

  const fromHome = heuristicTableNowFromPlayerIntent(
    "je rentre",
    mergeTableNow(emptyTableNow(), {
      location: "ta maison",
      lastBeat: "Vous avez quitté la taverne plus tôt.",
    }),
    "Maison au village"
  );
  assert.match(fromHome?.location ?? "", /maison/i);
});
