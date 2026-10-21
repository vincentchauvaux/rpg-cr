import type { CharacterSheet } from "../types.js";
import {
  type BriefActivity,
  normalizeCreationBrief,
} from "../character-brief.js";
import type { ProceduralMap } from "../types.js";
import { defaultRestrictions, normalizeAdventure } from "./parse.js";
import type {
  Adventure,
  AdventureNode,
  AdventureNodeKind,
  AdventurePlace,
} from "./types.js";
import { ADVENTURE_SCHEMA } from "./types.js";

const ACTIVITY_SEED: Record<
  BriefActivity,
  {
    placeId: string;
    placeName: string;
    kind: AdventureNodeKind;
    nodeId: string;
    title: string;
    youAre: string;
    extraLabel: string;
    extraWant: string;
    taboo?: string;
    exitKind: AdventureNodeKind;
    exitTitle: string;
    exitYou: string;
    tags: string[];
  }
> = {
  inn: {
    placeId: "auberge",
    placeName: "l'auberge",
    kind: "haven",
    nodeId: "auberge.table",
    title: "À table",
    youAre:
      "Tu es à une table, une chope à la main — tu n'es pas le service. Ton banc d'habitude est en vue.",
    extraLabel: "la tenancière",
    extraWant: "tenir la salle sans drame",
    taboo: "Tu n'es pas en cuisine, tu ne ranges pas, tu ne sers pas.",
    exitKind: "street",
    exitTitle: "Le seuil",
    exitYou: "Le battant donne sur la rue. L'air de dehors est plus net.",
    tags: ["inn", "haven", "social"],
  },
  patrol: {
    placeId: "ronde",
    placeName: "la ronde",
    kind: "street",
    nodeId: "ronde.consigne",
    title: "La consigne",
    youAre: "Tu tiens ta ronde. La consigne du jour est dans tes mains, ou devrait l'être.",
    extraLabel: "le camarade de faction",
    extraWant: "finir la ronde sans rapport",
    exitKind: "threshold",
    exitTitle: "La porte de ronde",
    exitYou: "Une porte que tu fermes chaque soir.",
    tags: ["patrol", "guard", "street"],
  },
  road: {
    placeId: "halte",
    placeName: "la halte de route",
    kind: "road",
    nodeId: "halte.feu",
    title: "La halte",
    youAre: "Tu es à la halte. Ton paquet est près de toi. La piste continue des deux côtés.",
    extraLabel: "un passant du métier",
    extraWant: "passer sans s'attarder",
    exitKind: "wilderness",
    exitTitle: "La piste",
    exitYou: "La piste, ornières, poussière ou boue selon le temps.",
    tags: ["road", "travel"],
  },
  market: {
    placeId: "marche",
    placeName: "la place du marché",
    kind: "street",
    nodeId: "marche.etal",
    title: "Contre l'étal",
    youAre: "Tu t'adosses à un étal. Autour : voix, balances, disputes d'étals — pas une quête.",
    extraLabel: "le voisin d'étal",
    extraWant: "vendre et qu'on le laisse",
    exitKind: "street",
    exitTitle: "Les ruelles du marché",
    exitYou: "Les ruelles partent de la place. On y porte des caisses, pas des prophéties.",
    tags: ["market", "social", "street"],
  },
  post: {
    placeId: "poste",
    placeName: "ton poste",
    kind: "workshop",
    nodeId: "poste.outil",
    title: "Au poste",
    youAre: "Tu es à ton poste. L'outil ou le registre que tu touches tous les jours est là — ou pas.",
    extraLabel: "la personne de service",
    extraWant: "que la vacation se passe",
    exitKind: "threshold",
    exitTitle: "La cour du poste",
    exitYou: "La cour, le seau, la porte sur la rue.",
    tags: ["post", "duty"],
  },
  trouble: {
    placeId: "abri",
    placeName: "un toit précaire",
    kind: "threshold",
    nodeId: "abri.regard",
    title: "On te regarde",
    youAre:
      "Tu es sous un toit précaire. On te doit, ou tu dois — l'affaire est petite et à toi, pas une guerre.",
    extraLabel: "quelqu'un qui te connaît trop",
    extraWant: "récupérer ou se défiler",
    exitKind: "street",
    exitTitle: "La ruelle",
    exitYou: "La ruelle où l'on baisse d'un cran quand tu passes.",
    tags: ["trouble", "debt", "social"],
  },
  looking_work: {
    placeId: "seuil-embauche",
    placeName: "le seuil où l'on embauche",
    kind: "threshold",
    nodeId: "embauche.file",
    title: "La file",
    youAre: "Tu attends au seuil où l'on embauche — ou refuse. La file, le silence, un regard.",
    extraLabel: "celui qui embauche aujourd'hui",
    extraWant: "prendre ou renvoyer sans explication",
    exitKind: "street",
    exitTitle: "Devant le seuil",
    exitYou: "Devant le seuil, ceux qui n'ont pas été pris.",
    tags: ["work", "social"],
  },
};

export interface SeedAdventureInput {
  roomCode: string;
  roomName: string;
  worldSeed: string;
  hostName: string;
  hostSheet?: CharacterSheet;
  map?: ProceduralMap | null;
  when?: string;
  weather?: string;
  incident?: string;
  placeOverride?: string;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "lieu";
}

export function seedAdventure(input: SeedAdventureInput): Adventure {
  const brief = normalizeCreationBrief(input.hostSheet?.creationBrief);
  const activity: BriefActivity = brief?.activity ?? "inn";
  const spec = ACTIVITY_SEED[activity];
  const placeName = input.placeOverride?.trim() || spec.placeName;
  const startPlace: AdventurePlace = {
    id: spec.placeId,
    name: placeName,
    kind: spec.kind,
    summary: `Lieu de départ (${activity}).`,
    tags: spec.tags,
    reveal: "public",
  };
  const startNode: AdventureNode = {
    id: spec.nodeId,
    placeId: spec.placeId,
    kind: spec.kind,
    title: spec.title,
    youAre: spec.youAre,
    tags: spec.tags,
    presentCastIds: ["extra-local"],
    hooks: input.incident
      ? [{ id: "hook-ouverture", text: input.incident, tags: spec.tags }]
      : [],
    exits: [
      {
        nodeId: `${spec.placeId}.dehors`,
        label: spec.exitTitle,
        effort: "step",
      },
    ],
    taboos: spec.taboo ? [spec.taboo] : [],
  };
  const exitNode: AdventureNode = {
    id: `${spec.placeId}.dehors`,
    placeId: spec.placeId,
    kind: spec.exitKind,
    title: spec.exitTitle,
    youAre: spec.exitYou,
    tags: ["exit", ...spec.tags],
    exits: [{ nodeId: spec.nodeId, label: spec.title, effort: "step" }],
  };

  const places: Record<string, AdventurePlace> = { [startPlace.id]: startPlace };
  const nodes: Record<string, AdventureNode> = {
    [startNode.id]: startNode,
    [exitNode.id]: exitNode,
  };

  let outdoor: AdventureNode = exitNode;
  if (spec.kind === "haven") {
    const street: AdventurePlace = {
      id: "rue",
      name: "la rue",
      kind: "street",
      summary: "Le village, pas un autre acte.",
      tags: ["street", "travel"],
      reveal: "public",
    };
    places[street.id] = street;
    const streetNode: AdventureNode = {
      id: "rue.pave",
      placeId: street.id,
      kind: "street",
      title: "La rue",
      youAre: `Tu es dans la rue. ${placeName} est derrière toi.`,
      tags: ["street", "travel"],
      exits: [{ nodeId: exitNode.id, label: spec.exitTitle, effort: "step" }],
    };
    nodes[streetNode.id] = streetNode;
    exitNode.exits = [
      ...(exitNode.exits ?? []),
      { nodeId: streetNode.id, label: "La rue", effort: "step" },
    ];
    outdoor = streetNode;
  }

  for (const poi of input.map?.pois ?? []) {
    const id = `poi-${slug(poi.name)}`;
    if (places[id]) continue;
    places[id] = {
      id,
      name: poi.name,
      summary: "Lieu nommé sur la carte — n'existe à table que si on s'y rend.",
      tags: ["map", "poi"],
      reveal: "public",
    };
    const nodeId = `${id}.arrivee`;
    nodes[nodeId] = {
      id: nodeId,
      placeId: id,
      kind: "other",
      title: poi.name,
      youAre: `Tu es à ${poi.name} — seulement parce que tu y es venu.`,
      tags: ["map", "poi", "travel"],
      exits: [{ nodeId: outdoor.id, label: outdoor.title, effort: "travel" }],
    };
    outdoor.exits = [
      ...(outdoor.exits ?? []),
      { nodeId, label: poi.name, effort: "travel" },
    ];
  }

  return normalizeAdventure({
    schema: ADVENTURE_SCHEMA,
    id: input.roomCode.toLowerCase(),
    title: input.roomName,
    premise: input.incident?.slice(0, 180) || `Tu es déjà à ${placeName}.`,
    worldSeed: input.worldSeed,
    tone: {
      genre: ["fantasy", "table"],
      taboos: [
        "pas de guerre collée",
        "pas de McGuffin d'inconnu",
        "pas de secret du père hors fiche",
      ],
      scale: "intimate",
    },
    restrictions: [
      ...defaultRestrictions(),
      input.hostName.trim()
        ? `Le PJ s'appelle ${input.hostName.trim()} — 2e personne (« tu »), jamais un PNJ à suivre.`
        : "",
    ].filter(Boolean),
    now: {
      nodeId: spec.nodeId,
      placeId: spec.placeId,
      timeOfDay: input.when,
      weather: input.weather,
      lastBeat: input.incident,
      establishedFactIds: [],
      unlockedSecretIds: [],
    },
    places,
    nodes,
    cast: {
      "extra-local": {
        id: "extra-local",
        label: spec.extraLabel,
        kind: "extra",
        named: false,
        tags: spec.tags,
        reveal: "public",
        want: spec.extraWant,
        homePlaceId: spec.placeId,
      },
    },
    facts: input.incident
      ? [
          {
            id: "beat-ouverture",
            kind: "beat",
            text: input.incident,
            nodeIds: [spec.nodeId],
            placeIds: [spec.placeId],
            reveal: "established",
            tags: spec.tags,
          },
        ]
      : [],
    secrets: [],
    clocks: [],
    quests: [],
    modules: {
      magic: { deadMagic: false },
    },
    calendar: input.when ? { dayName: input.when } : undefined,
  });
}
