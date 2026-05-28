import { createNoise2D } from "simplex-noise";
import type {
  MapPointOfInterest,
  MapTerritory,
  ProceduralMap,
} from "../types.js";
import {
  generateProceduralCountryNames,
  generateProceduralDungeonName,
  generateProceduralRulerName,
  generateProceduralTerritoryName,
} from "./world-names.js";

export type Biome =
  | "ocean"
  | "coast"
  | "plains"
  | "forest"
  | "hills"
  | "mountain"
  | "swamp"
  | "desert";

export type Effect = "toxic" | "fog" | "evil" | "buff" | null;

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    h += h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function biomeFromHeight(h: number, moisture: number): Biome {
  if (h < 0.32) return "ocean";
  if (h < 0.36) return "coast";
  if (h > 0.82) return "mountain";
  if (h > 0.68) return "hills";
  if (moisture < 0.25 && h > 0.45) return "desert";
  if (moisture > 0.72 && h < 0.5) return "swamp";
  if (moisture > 0.45) return "forest";
  return "plains";
}

function effectAt(x: number, y: number, rnd: () => number): Effect {
  const n = rnd();
  if (n < 0.04) return "toxic";
  if (n < 0.08) return "fog";
  if (n < 0.11) return "evil";
  if (n < 0.14) return "buff";
  return null;
}

const BIOME_COLORS: Record<Biome, string> = {
  ocean: "#1e3a5f",
  coast: "#4a7c9b",
  plains: "#6b8f4e",
  forest: "#2d5a27",
  hills: "#8b7355",
  mountain: "#9ca3af",
  swamp: "#4a6741",
  desert: "#c4a35a",
};

const EFFECT_OVERLAY: Record<Exclude<Effect, null>, string> = {
  toxic: "rgba(80,200,80,0.35)",
  fog: "rgba(200,200,220,0.4)",
  evil: "rgba(120,40,120,0.35)",
  buff: "rgba(255,215,100,0.25)",
};

export function generateProceduralMap(
  seed: string,
  width = 32,
  height = 24,
  cellSize = 12
): ProceduralMap {
  const rnd = seededRandom(seed);
  const noise2D = createNoise2D(() => rnd());
  const heightmap: number[][] = [];
  const biomes: string[][] = [];
  const effects: ("toxic" | "fog" | "evil" | "buff")[][] = [];

  for (let y = 0; y < height; y++) {
    heightmap[y] = [];
    biomes[y] = [];
    effects[y] = [];
    for (let x = 0; x < width; x++) {
      const nx = x / width - 0.5;
      const ny = y / height - 0.5;
      const e = 1 - Math.sqrt(nx * nx + ny * ny) * 1.4;
      const h =
        (noise2D(x * 0.08, y * 0.08) + 1) * 0.5 * 0.6 +
        (noise2D(x * 0.16 + 100, y * 0.16) + 1) * 0.5 * 0.25 +
        e * 0.15;
      const moisture = (noise2D(x * 0.12 + 50, y * 0.12 + 50) + 1) * 0.5;
      heightmap[y][x] = h;
      const biome = biomeFromHeight(h, moisture);
      biomes[y][x] = biome;

      if (biome === "ocean") {
        effects[y][x] = "fog";
      } else {
        const eff = effectAt(x + seed.length, y, rnd);
        effects[y][x] = eff ?? "fog";
      }
    }
  }

  const svgW = width * cellSize;
  const svgH = height * cellSize;
  let rects = "";
  let overlays = "";

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const biome = biomes[y][x] as Biome;
      const color = BIOME_COLORS[biome];
      rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}" />`;
      const eff = effects[y][x];
      if (eff && eff !== "fog" && biome !== "ocean") {
        overlays += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${EFFECT_OVERLAY[eff]}" />`;
      }
    }
  }

  const countryPool = generateProceduralCountryNames(seed, 5);
  const countries = countryPool.slice(0, 3 + Math.floor(rnd() * 2));
  const territories: MapTerritory[] = countries.map((country, i) => {
    const tw = Math.floor(width / 3);
    const th = Math.floor(height / 2);
    const col = i % 3;
    const row = Math.floor(i / 3);
    return {
      id: `ter-${i}`,
      name: generateProceduralTerritoryName(seed, country, i),
      country,
      bounds: {
        x: col * tw,
        y: row * th,
        w: tw,
        h: th,
      },
    };
  });

  const pois: MapPointOfInterest[] = [];
  const poiTypes: MapPointOfInterest["type"][] = [
    "capital",
    "city",
    "village",
    "church",
    "dungeon",
    "unknown",
  ];

  for (let i = 0; i < 8; i++) {
    let px = Math.floor(rnd() * width);
    let py = Math.floor(rnd() * height);
    let tries = 0;
    while (
      (biomes[py][px] === "ocean" || biomes[py][px] === "mountain") &&
      tries < 20
    ) {
      px = Math.floor(rnd() * width);
      py = Math.floor(rnd() * height);
      tries++;
    }
    const type = poiTypes[i % poiTypes.length];
    const country = countries[i % countries.length];
    pois.push({
      id: `poi-${i}`,
      type,
      name:
        type === "capital"
          ? `Capitale de ${country}`
          : type === "dungeon"
            ? generateProceduralDungeonName(seed, i)
            : `${type} ${i + 1}`,
      x: px,
      y: py,
      ruler: generateProceduralRulerName(seed, i),
      country,
    });
  }

  let poiMarkers = "";
  for (const p of pois) {
    const cx = p.x * cellSize + cellSize / 2;
    const cy = p.y * cellSize + cellSize / 2;
    const fill =
      p.type === "dungeon"
        ? "#4a1a1a"
        : p.type === "capital"
          ? "#d4af37"
          : "#f5f0e1";
    poiMarkers += `<circle cx="${cx}" cy="${cy}" r="4" fill="${fill}" stroke="#1a1510" stroke-width="1" />`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
  <rect width="100%" height="100%" fill="#0f1419"/>
  ${rects}
  ${overlays}
  ${poiMarkers}
</svg>`;

  return {
    seed,
    width,
    height,
    cellSize,
    svg,
    biomes,
    heightmap,
    effects,
    territories,
    pois,
    countries,
  };
}
