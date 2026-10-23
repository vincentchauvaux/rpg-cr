import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPlayLocks, formatPlayLocksForMj } from "./play-locks.js";

test("le premier prix et la première offre restent, les suivantes sont ignorées", () => {
  const locks = extractPlayLocks([
    {
      kind: "mj",
      content:
        "Si tu veux l'essayer, je te donne les graines d'adrépar, le champignon de l'ombre et le jus de la fleur de lune.",
    },
    {
      kind: "mj",
      content:
        "Le prix des ingrédients est de vingt pièces d'or. Cela inclut la poudre d'étoile de lune, le liquide de l'ombre d'un loup et les feuilles de l'arbre de la nuit.",
    },
    {
      kind: "mj",
      content: "Les herbes de la vallée de Mornel, l'écorce de Lathor…",
    },
  ]);
  assert.equal(locks.price, "20 pièces d'or");
  assert.match(locks.offer ?? "", /graines d'adrépar/);
  assert.doesNotMatch(locks.offer ?? "", /étoile de lune|Mornel/);
});

test("objets pris : épée et parchemin", () => {
  const locks = extractPlayLocks([
    {
      kind: "mj",
      content: "Vous avez maintenant l'épée de poing sous la main.",
    },
    { kind: "action", content: "Je prends le parchemin et je retourne à la taverne" },
  ]);
  assert.ok(locks.taken.includes("épée de poing"));
  assert.ok(locks.taken.includes("parchemin"));
  assert.match(formatPlayLocksForMj(locks), /Verrous/);
  assert.match(formatPlayLocksForMj(locks), /mot pour mot/);
});
