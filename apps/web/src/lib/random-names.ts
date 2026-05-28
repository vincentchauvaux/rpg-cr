const ROOM_PREFIXES = [
  "Taverne",
  "Auberge",
  "Hall",
  "Refuge",
  "Sanctuaire",
  "Crypte",
  "Tour",
  "Campement",
];

const ROOM_SUFFIXES = [
  "du Griffon",
  "de la Chope",
  "des Brumes",
  "du Dragon",
  "du Rat d'Or",
  "des Ombres",
  "du Dé Roulé",
  "du Héros Fatigué",
];

const PLAYER_FIRST = [
  "Aldric",
  "Elara",
  "Thorin",
  "Mira",
  "Gwen",
  "Borin",
  "Sera",
  "Kael",
  "Ysolde",
  "Hagan",
];

const PLAYER_EPITHETS = [
  "Cendrebrune",
  "Trois-Dés",
  "Brume-Fine",
  "Bouclier-Cassé",
  "Lame-Douce",
  "Sans-Carte",
  "de la Forge",
  "le Prudente",
  "Murmure-Nuit",
  "Pièce-d'Or",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomRoomName(): string {
  return `${pick(ROOM_PREFIXES)} ${pick(ROOM_SUFFIXES)}`;
}

export function randomPlayerName(): string {
  return `${pick(PLAYER_FIRST)} ${pick(PLAYER_EPITHETS)}`;
}
