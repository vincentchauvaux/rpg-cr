/** Fond sombre UI — contraste vérifié ≥ 4.5:1 (WCAG AA texte normal) */
export const PLAYER_COLOR_BG = "#1a1f2e";

/** Palette médiévale sobre — contrastes validés sur PLAYER_COLOR_BG */
export const PLAYER_PALETTE = [
  { id: "amber", label: "Ambre", hex: "#e8c547" },
  { id: "sage", label: "Sauge", hex: "#8fd4a8" },
  { id: "sky", label: "Ciel", hex: "#7ec8ef" },
  { id: "rose", label: "Rose cuivré", hex: "#f0a090" },
  { id: "lavender", label: "Brume", hex: "#c4b4f0" },
  { id: "moss", label: "Mousse", hex: "#9fd4a6" },
  { id: "sand", label: "Sable", hex: "#d4c4a0" },
  { id: "slate", label: "Ardoise", hex: "#a8c8e0" },
] as const;

export type PlayerPaletteId = (typeof PLAYER_PALETTE)[number]["id"];

export const MJ_DISPLAY_COLOR = "#b48ae8";

export function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase();
}

export function paletteHexById(id: string | null | undefined): string | null {
  return PLAYER_PALETTE.find((p) => p.id === id)?.hex ?? null;
}

/** Couleur aléatoire non utilisée dans le salon (fallback si palette épuisée) */
export function pickUnusedColor(usedHexes: string[]): string {
  const used = new Set(usedHexes.filter(Boolean).map(normalizeHex));
  const free = PLAYER_PALETTE.filter((p) => !used.has(normalizeHex(p.hex)));
  const pool = free.length ? free : PLAYER_PALETTE;
  return pool[Math.floor(Math.random() * pool.length)].hex;
}

/** @deprecated Préférer pickUnusedColor */
export function randomPaletteColor(usedHexes: string[]): string {
  return pickUnusedColor(usedHexes);
}

/** @deprecated Préférer pickUnusedColor — conservé pour compat */
export function nextPaletteColor(usedHexes: string[]): string {
  return pickUnusedColor(usedHexes);
}
