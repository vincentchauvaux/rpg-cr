import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCampaignOpeningRewritePrompt,
  buildOpeningPalette,
  isCampaignOpeningTooThin,
  isCampaignOpeningUnplayable,
  namesReferToSamePerson,
  openingDumpsEncyclopedia,
  openingInventedFamilySecret,
  openingInventedNamedNpc,
  openingLooksLikeQuestMcGuffin,
  openingLooksLikeStockHook,
  openingSkipsPlaceSetup,
  openingTreatsGuestAsStaff,
  openingInventedPriorFavor,
  openingTreatsHostAsNpc,
  openingSpeaksForPlayer,
  openingLooksLikeQcmMenu,
  parseCampaignOpeningPlan,
  renderFallbackOpeningNarrative,
  type CampaignOpeningPlan,
} from "./campaign-opening-prompt.js";

test("ouverture trop mince : Que feras-tu", () => {
  assert.equal(isCampaignOpeningTooThin("Que feras-tu ?"), true);
  assert.equal(
    isCampaignOpeningTooThin(
      "Tu es Timmy, sergent des gardes. Tes hommes tiennent la lisière. " +
        "Le camp de Kethune fume encore. Une tente principale béante, des cendres, " +
        "une relique disparue. L'enjeu est de retrouver ce qui a été volé avant la nuit. " +
        "Autour de toi la pente, le crépuscule, tes hommes qui attendent tes ordres. " +
        "Que fais-tu ?"
    ),
    false
  );
});

test("secours d'ouverture : le PJ n'est pas un PNJ à rejoindre", () => {
  const plan: CampaignOpeningPlan = {
    worldSummary: "Les marches de Kethune tiennent la passe.",
    mainPlot: "Retrouver la relique avant le culte.",
    startingSituation: "Le camp des gardes a brûlé à l'aube.",
    openingScene: "Devant la tente principale, encore chaude.",
    scene: { location: "Camp de Kethune", mood: "cendres et vent", tension: -20 },
  };
  const text = renderFallbackOpeningNarrative(plan, {
    roomName: "Test",
    worldSeed: "abc",
    map: null,
    hostName: "Timmy",
    hostSheet: {
      rank: "Sergent",
      servants: "huit gardes de la compagnie",
      background: "Vétéran de la passe.",
    },
  });
  assert.match(text, /Tu es Timmy, Sergent/);
  assert.match(text, /huit gardes/);
  assert.doesNotMatch(text, /Rejoins Timmy/i);
  assert.doesNotMatch(text, /Enjeu\s*:/);
  assert.equal(isCampaignOpeningUnplayable(text, "Timmy"), false);
});

const THORIN_NPC_OPENING = `
La rivière qui serpente au bord du campement des Ombres se reflète dans les feux de camp.
Au centre de ce petit havre, Thorin Brume‑Fine, cuirassé et couronné de l'emblème de la Garde de l'Aube, se tient debout, son regard fixé sur la lueur rougeoyante des braises.

« Vous êtes arrivés à l'heure, » dit-il, la voix grave mais calme. « J'ai besoin d'une équipe fiable. »

Le chevalier hoche la tête, puis se tourne vers vous. « Vous avez le choix : vous pouvez suivre Thorin jusqu'au bord de la rivière. »

Thorin vous regarde, son regard déterminé comme le métal.

Que choisissez-vous d'abord ?
Inspecter la rive et repérer les traces de passage des brigands.
`.repeat(1);

test("ouverture injouable : l'hôte est narré comme un PNJ recruteur", () => {
  assert.equal(openingTreatsHostAsNpc(THORIN_NPC_OPENING, "Thorin Brume-Fine"), true);
  assert.equal(isCampaignOpeningUnplayable(THORIN_NPC_OPENING, "Thorin Brume-Fine"), true);
  assert.equal(
    openingTreatsHostAsNpc(
      "Tu es Thorin Brume-Fine. Tes hommes attendent. Un éclaireur revient de la rive. Que fais-tu ?",
      "Thorin Brume-Fine"
    ),
    false
  );
});

test("même personne malgré prénom seul ou tiret unicode", () => {
  assert.equal(namesReferToSamePerson("Thorin Brume-Fine", "Thorin Brume‑Fine"), true);
  assert.equal(namesReferToSamePerson("Thorin Brume-Fine", "Thorin"), true);
  assert.equal(namesReferToSamePerson("Thorin", "Mira"), false);
});

test("plan JSON : parse sans PNJ d'ouverture", () => {
  const raw = JSON.stringify({
    worldSummary: "Un camp au bord de la rivière.",
    mainPlot: "Récupérer le grimoire volé.",
    startingSituation: "Tu tiens le camp.",
    openingScene: "Les brigands fuient vers la rive.",
    scene: { location: "Campement des Ombres", mood: "braises", tension: -30 },
    optionalNpc: { name: "Sir Aldric", role: "chevalier", hook: "recrute" },
  });
  const plan = parseCampaignOpeningPlan(raw);
  assert.ok(plan);
  assert.equal(plan!.scene.location, "Campement des Ombres");
});

test("réécriture d'ouverture : le prompt cite le texte raté", () => {
  const plan: CampaignOpeningPlan = {
    worldSummary: "Les marches tiennent la passe.",
    mainPlot: "Retrouver la relique.",
    startingSituation: "Le camp a brûlé.",
    openingScene: "Devant la tente.",
    scene: { location: "Camp", mood: "cendres", tension: -20 },
  };
  const prompt = buildCampaignOpeningRewritePrompt(THORIN_NPC_OPENING, plan, {
    roomName: "Test",
    worldSeed: "abc",
    map: null,
    hostName: "Thorin Brume-Fine",
    hostSheet: { rank: "Chevalier" },
  });
  assert.match(prompt, /RÉÉCRITURE/);
  assert.match(prompt, /suivre Thorin/);
  assert.match(prompt, /JOUEUR/);
  assert.match(prompt, /In medias res/);
});

const SERA_OPENING = `
Tu es Sera Lame‑Douce, chevalier de la Couronne d’Argent, marchant dans les ruelles étroites de Murmures.
La nuit est fraîche, mais le vent qui s’échappe de la chapelle des Brumes porte un parfum de bois brûlé et des murmures lointains.
Les lanternes aux lueurs argentées projettent des ombres dansantes sur les pierres anciennes de la porte.
Tu sens l’écho d’une présence silencieuse derrière toi : Sir Aldric, Gardien de la Couronne, tient un parchemin.
Un murmure se fait entendre dans la ruelle, comme si les murs eux-mêmes cherchaient à te parler.
Sir Aldric murmure : « La vérité sur ton père se cache ici, mais elle n’est pas sans danger. »
`;

test("ouverture injouable : parchemin crypté d'un inconnu qui disparaît", () => {
  const text =
    "Vous êtes assis au comptoir. Un homme aux yeux perçants dépose un parchemin griffonné " +
    "puis se fond rapidement dans la foule. « L'éclat de la mer se cache sous le soleil couchant. " +
    "Trouvez le phare d'argent. » Que faites-vous ?";
  assert.equal(openingLooksLikeQuestMcGuffin(text), true);
  assert.equal(isCampaignOpeningUnplayable(text, "Bibhou"), true);
});

const BABU_BAG_OPENING = `
Sous le grand chêne qui tranche la route, le crépitement d'un petit feu éclaire les visages fatigués de Babu.
Un homme aux habits sales s'avance. « Nous avons perdu notre sac, pouvons-nous compter sur votre aide pour le retrouver ? »
Babu doit décider : partager ce qu'il a, aider les voyageurs, ou les repousser.
`;

test("ouverture injouable : étrangers qui ont perdu un sac", () => {
  assert.equal(openingLooksLikeQuestMcGuffin(BABU_BAG_OPENING), true);
  assert.equal(openingTreatsHostAsNpc(BABU_BAG_OPENING, "Babu"), true);
  assert.equal(isCampaignOpeningUnplayable(BABU_BAG_OPENING, "Babu"), true);
  assert.equal(
    openingTreatsHostAsNpc(
      "Tu es Babu. Tes mains sont froides. Un voisin que tu connais t'appelle. Que fais-tu ?",
      "Babu"
    ),
    false
  );
});

test("ouverture injouable : Sir Aldric et secret du père hors fiche", () => {
  assert.equal(openingInventedNamedNpc(SERA_OPENING, "Sera Lame-Douce", { rank: "Chevalier" }), true);
  assert.equal(openingInventedFamilySecret(SERA_OPENING, { rank: "Chevalier" }), true);
  assert.equal(
    isCampaignOpeningUnplayable(SERA_OPENING, "Sera Lame-Douce", {
      sheet: { rank: "Chevalier" },
      mjProse: 20,
    }),
    true
  );
});

const JROUNCH_CRISIS = `
Tu es Jrounch le jrunch, Villageois. Tes hommes sont avec toi : Aucun. Je vis ici depuis toujours, paysan, à l'auberge ou à la taverne.

Jrounch le jrunch se trouve dans l'auberge du village, en train de servir un verre de bière aux villageois.

Un voisin, le vieux Maître Lien, arrive en larmes, expliquant que des brigands ont volé la dernière cargaison de blé et menacent de détruire le champ.

Autour de toi : Auberge du village. Tension palpable.

La République de Zargard-gar, un pays de plaines fertiles et de villages paisibles.

Enjeu : Un conflit naissant entre les agriculteurs du village et un groupe de brigands qui s'approprie les récoltes.
`;

test("ouverture injouable : encyclopédie, Maître nommé, guerre agricole", () => {
  assert.equal(openingInventedNamedNpc(JROUNCH_CRISIS, "Jrounch le jrunch"), true);
  assert.equal(openingTreatsHostAsNpc(JROUNCH_CRISIS, "Jrounch le jrunch"), true);
  assert.equal(openingLooksLikeQuestMcGuffin(JROUNCH_CRISIS), true);
  assert.equal(openingDumpsEncyclopedia(JROUNCH_CRISIS), true);
  assert.equal(isCampaignOpeningUnplayable(JROUNCH_CRISIS, "Jrounch le jrunch"), true);
});

test("secours d'ouverture : paysan seul, pas de guerre collée", () => {
  const plan: CampaignOpeningPlan = {
    worldSummary: "La République de Zargard-gar, un pays de plaines fertiles.",
    mainPlot: "Un conflit naissant entre agriculteurs et brigands.",
    startingSituation:
      "Jrounch le jrunch se trouve dans l'auberge du village, en train de servir un verre.",
    openingScene:
      "Un voisin, le vieux Maître Lien, arrive en larmes : des brigands ont volé le blé.",
    scene: { location: "Auberge du village", mood: "Tension palpable", tension: 10 },
  };
  const text = renderFallbackOpeningNarrative(plan, {
    roomName: "Test",
    worldSeed: "abc",
    map: null,
    hostName: "Jrounch le jrunch",
    hostSheet: {
      rank: "Villageois",
      servants: "Aucun — tu es seul.",
      background: "Je vis ici depuis toujours, paysan, à l'auberge ou à la taverne.",
    },
  });
  assert.match(text, /Tu es Jrounch le jrunch, Villageois/);
  assert.match(text, /Auberge du village/);
  assert.doesNotMatch(text, /Tes hommes/);
  assert.doesNotMatch(text, /Je vis ici/);
  assert.doesNotMatch(text, /Maître Lien/);
  assert.doesNotMatch(text, /Enjeu\s*:/);
  assert.doesNotMatch(text, /République/);
  assert.equal(
    isCampaignOpeningUnplayable(text, "Jrounch le jrunch", {
      sheet: { rank: "Villageois" },
      mjProse: 20,
    }),
    false
  );
});

const CHING_STOCK_OPENING = `
Le vieux, sa barbe grise tremblante, s'approche du comptoir où vous sirotez votre chope. Le parfum de bois brûlé et de bière fraîche flotte dans l'air. Il baisse la voix, s’appuyant sur sa canne.
« J’ai vu un homme étrange sortir du comptoir, sac de provisions à la main. Il portait un manteau sombre, et ses pas étaient pressés. Il n’était pas du village, j’en suis sûr. »
L’odeur de houblon se mêle à un léger parfum de bois de santal que dégage son manteau.
Vous pouvez répondre, regarder autour, ou demander plus de détails.
Que faites‑vous ?
`;

test("ouverture injouable : le vieux au comptoir et l'étranger au sac", () => {
  assert.equal(openingLooksLikeStockHook(CHING_STOCK_OPENING), true);
  assert.equal(openingLooksLikeQuestMcGuffin(CHING_STOCK_OPENING), true);
  assert.equal(openingSkipsPlaceSetup(CHING_STOCK_OPENING), true);
  assert.equal(isCampaignOpeningUnplayable(CHING_STOCK_OPENING, "Ching choung"), true);
});

test("palette d'ouverture : deux graines, deux poses", () => {
  const sheet = {
    rank: "Villageois",
    creationBrief: { station: "peasant" as const, activity: "inn" as const, past: "local" as const },
  };
  const a = buildOpeningPalette({
    roomName: "Test",
    worldSeed: "graine-alpha-111",
    map: null,
    hostName: "Ching",
    hostSheet: sheet,
  });
  const b = buildOpeningPalette({
    roomName: "Test",
    worldSeed: "graine-omega-999",
    map: null,
    hostName: "Ching",
    hostSheet: sheet,
  });
  assert.notEqual(`${a.when}|${a.weather}|${a.incident}`, `${b.when}|${b.weather}|${b.incident}`);
  assert.match(a.place, /auberge/i);
});

const KAEL_STAFF_OPENING = `
La taverne du Héros Fatigué s'éclaire d'une lueur tamisée. Il est presque 19h, et tu ranges la dernière assiette de la soirée.
Soudain, un homme à la barbe grisonnante s'avance vers toi. Il tient un petit sac de pain.
« Tu te souviens du morceau de pain que j'ai laissé à ta table hier soir ? » Il t'a déjà demandé ce service.
Que fais-tu ?
`;

test("ouverture injouable : paysan à l'auberge rangé en serveur + faveur d'hier", () => {
  const sheet = {
    rank: "Villageois",
    creationBrief: { station: "peasant" as const, activity: "inn" as const, past: "local" as const },
  };
  assert.equal(openingTreatsGuestAsStaff(KAEL_STAFF_OPENING, sheet), true);
  assert.equal(openingInventedPriorFavor(KAEL_STAFF_OPENING), true);
  assert.equal(isCampaignOpeningUnplayable(KAEL_STAFF_OPENING, "Kael Sans-Carte", { sheet }), true);
});

test("ouverture client à l'auberge (chope, pas de service) reste jouable", () => {
  const sheet = {
    rank: "Villageois",
    creationBrief: { station: "peasant" as const, activity: "inn" as const, past: "local" as const },
  };
  const text = `
Tu es à la taverne du Héros Fatigué, une chope à la main, assis à ta table habituelle. Le feu crépite.
La tenancière essuie trop longtemps le même verre. Ton banc d'habitude n'est pas libre.
Que fais-tu ?
`;
  assert.equal(openingTreatsGuestAsStaff(text, sheet), false);
  assert.equal(openingInventedPriorFavor(text, sheet), false);
  assert.equal(isCampaignOpeningUnplayable(text, "Kael Sans-Carte", { sheet }), false);
});

const YODELI_KITCHEN_OPENING = `
Tu es dans la grande salle de l'Auberge du Griffon. Tu t'actives en préparant un repas simple pour les voyageurs attendus. Tes mains manipulent des légumes et une cuillère de bois.
Tu es en train de couper des pommes de terre lorsque le propriétaire, un homme nommé Gauthier, s'approche.
« Yodeli yodelou, as-tu déjà entendu parler d'une dette ? »
Tu connais bien cette voix, et tu sais qu'il te rappelle un vieux prêt que tu as oublié d'apurer.
« Je… Bien sûr, » réponds-tu. « Quel montant devais-je t'avancer, Gauthier ? »
### Questions
1. Laisseras-tu Gauthier te rappeler devant tout le monde ?
2. Chercheras-tu un moyen d'arranger les choses avec lui rapidement ?
3. Essaieras-tu de trouver des clients en retard qui pourraient t'aider ?
`;

test("ouverture injouable : cuisine + dette inventée + réplique du PJ (Yodeli)", () => {
  const sheet = {
    rank: "Villageois",
    creationBrief: { station: "peasant" as const, activity: "inn" as const, past: "local" as const },
  };
  assert.equal(openingTreatsGuestAsStaff(YODELI_KITCHEN_OPENING, sheet), true);
  assert.equal(openingInventedPriorFavor(YODELI_KITCHEN_OPENING, sheet), true);
  assert.equal(openingInventedNamedNpc(YODELI_KITCHEN_OPENING, "Yodeli yodelou", sheet), true);
  assert.equal(openingSpeaksForPlayer(YODELI_KITCHEN_OPENING), true);
  assert.equal(openingLooksLikeQcmMenu(YODELI_KITCHEN_OPENING), true);
  assert.equal(
    isCampaignOpeningUnplayable(YODELI_KITCHEN_OPENING, "Yodeli yodelou", { sheet }),
    true
  );
});
