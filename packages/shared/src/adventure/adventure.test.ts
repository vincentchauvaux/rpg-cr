import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatAdventureSliceForMj } from "./format.js";
import { inferAdventureEventKind } from "./infer.js";
import { parseAdventureJson } from "./parse.js";
import { selectAdventureSlice } from "./retrieve.js";
import { seedAdventure } from "./seed.js";
import { advanceAdventure, pickNextAdventureNode } from "./advance.js";
import { ADVENTURE_SCHEMA } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

test("graine auberge : nœud client, pas cuisine", () => {
  const adv = seedAdventure({
    roomCode: "TLZLPQ",
    roomName: "Tqt 1000",
    worldSeed: "abc",
    hostName: "Kael",
    hostSheet: {
      rank: "Villageois",
      creationBrief: { station: "peasant", activity: "inn", past: "local" },
    },
    incident: "La tenancière essuie trop longtemps le même verre.",
    when: "soir de lanternes",
    weather: "L'air est tiède.",
  });
  assert.equal(adv.schema, ADVENTURE_SCHEMA);
  assert.equal(adv.now.nodeId, "auberge.table");
  const slice = selectAdventureSlice(adv, { kind: "opening" });
  assert.match(slice.node?.youAre ?? "", /n'es pas le service/);
  assert.equal(slice.presentCast[0]?.named, false);
  assert.ok(slice.restrictions.some((r) => /PNJ nommé/i.test(r)));
  const md = formatAdventureSliceForMj(slice, 2800);
  assert.doesNotMatch(md, /Gauthier|Sir Aldric|Enjeu\s*:/);
  assert.ok(md.length < 2800);
});

test("secret verrouillé absent du prompt", () => {
  const adv = seedAdventure({
    roomCode: "X",
    roomName: "X",
    worldSeed: "s",
    hostName: "Sera",
  });
  adv.secrets = [
    { id: "pere", text: "La vérité sur ton père se cache ici.", locked: true, tags: ["family"] },
  ];
  const hidden = selectAdventureSlice(adv, { kind: "inspect", text: "je cherche mon père" });
  assert.equal(hidden.secrets.length, 0);
  adv.now.unlockedSecretIds = ["pere"];
  const open = selectAdventureSlice(adv, {
    kind: "inspect",
    includeUnlockedSecrets: true,
  });
  assert.equal(open.secrets.length, 1);
});

test("combat n'apporte le bestiaire que si demandé", () => {
  const adv = seedAdventure({
    roomCode: "X",
    roomName: "X",
    worldSeed: "s",
    hostName: "Babu",
    hostSheet: { creationBrief: { station: "ranger", activity: "road", past: "alone" } },
  });
  adv.creatures = {
    loup: {
      id: "loup",
      label: "un loup affamé",
      summary: "Côtes, pas un démon.",
      tags: ["combat", "wilderness"],
      threat: "nuisance",
    },
  };
  const social = selectAdventureSlice(adv, { kind: "social", text: "je parle au passant" });
  assert.equal(social.creatures.length, 0);
  const fight = selectAdventureSlice(adv, { kind: "combat", text: "je dégaine" });
  assert.equal(fight.creatures.length, 1);
});

test("infer : rentrer / fouiller / frapper / sortir un objet", () => {
  assert.equal(inferAdventureEventKind("je rentre chez moi"), "enter");
  assert.equal(inferAdventureEventKind("je fouille le banc"), "inspect");
  assert.equal(inferAdventureEventKind("je frappe l'homme"), "combat");
  assert.equal(inferAdventureEventKind("je sors"), "leave");
  assert.equal(inferAdventureEventKind("je sors mon épée"), "use_item");
  assert.equal(inferAdventureEventKind("ok"), "action");
});

test("parse JSON aventure", () => {
  const adv = parseAdventureJson(
    JSON.stringify(
      seedAdventure({
        roomCode: "AA",
        roomName: "AA",
        worldSeed: "z",
        hostName: "Ching",
      })
    )
  );
  assert.ok(adv);
  assert.equal(adv!.now.nodeId, "auberge.table");
});

test("le pion suit les sorties : table → seuil → rue, pas le social", () => {
  const adv = seedAdventure({
    roomCode: "MV",
    roomName: "Mouvant",
    worldSeed: "m",
    hostName: "Kael",
    hostSheet: { creationBrief: { station: "peasant", activity: "inn", past: "local" } },
  });
  assert.ok(adv.nodes["auberge.dehors"]);
  assert.ok(adv.nodes["rue.pave"]);
  const seuil = pickNextAdventureNode(adv, { text: "je sors" });
  assert.equal(seuil?.id, "auberge.dehors");
  const { adventure: atDoor, moved } = advanceAdventure(adv, { text: "je sors" });
  assert.equal(moved, true);
  assert.equal(atDoor.now.nodeId, "auberge.dehors");
  const { adventure: inStreet } = advanceAdventure(atDoor, { text: "je sors" });
  assert.equal(inStreet.now.nodeId, "rue.pave");
  const { adventure: back } = advanceAdventure(atDoor, { text: "je rentre" });
  assert.equal(back.now.nodeId, "auberge.table");
  const { adventure: still, moved: stayed } = advanceAdventure(adv, {
    text: "je parle à la tenancière",
  });
  assert.equal(stayed, false);
  assert.equal(still.now.nodeId, "auberge.table");
});

test("lieu de table « la rue » vise le nœud rue, pas la table", () => {
  const adv = seedAdventure({
    roomCode: "LC",
    roomName: "Lieu",
    worldSeed: "l",
    hostName: "Sera",
    hostSheet: { creationBrief: { station: "peasant", activity: "inn", past: "local" } },
  });
  const node = pickNextAdventureNode(adv, { location: "la rue" });
  assert.equal(node?.id, "rue.pave");
});

test("exemple fantasy : le bois n'existe qu'en y allant", () => {
  const raw = readFileSync(join(here, "example.fantasy.json"), "utf8");
  const adv = parseAdventureJson(raw);
  assert.ok(adv);
  const stay = pickNextAdventureNode(adv!, { text: "je bois une chope", kind: "rest" });
  assert.equal(stay?.id, "auberge.table");
  const { adventure: piste } = advanceAdventure(adv!, {
    text: "je prends le chemin du bois",
  });
  assert.equal(piste.now.nodeId, "bois.piste");
  const hidden = selectAdventureSlice(piste, { kind: "inspect", text: "je cherche la crypte" });
  assert.equal(hidden.secrets.length, 0);
});

test("graine avec POI : le lieu a un nœud, pas seulement une fiche", () => {
  const adv = seedAdventure({
    roomCode: "POI",
    roomName: "Carte",
    worldSeed: "p",
    hostName: "Babu",
    hostSheet: { creationBrief: { station: "peasant", activity: "inn", past: "local" } },
    map: {
      seed: "p",
      width: 1,
      height: 1,
      cellSize: 1,
      svg: "",
      biomes: [],
      heightmap: [],
      effects: [],
      territories: [],
      countries: [],
      pois: [
        {
          id: "corbeaux",
          type: "unknown",
          name: "la colline aux corbeaux",
          x: 0,
          y: 0,
        },
      ],
    },
  });
  const poiNode = Object.values(adv.nodes).find((n) => /corbeaux/i.test(n.title));
  assert.ok(poiNode);
  const { adventure: gone } = advanceAdventure(adv, {
    text: "je vais à la colline aux corbeaux",
  });
  assert.equal(gone.now.nodeId, poiNode!.id);
});
