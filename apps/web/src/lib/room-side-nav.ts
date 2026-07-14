export type RoomSideTab =
  | "main"
  | "sheet"
  | "companions"
  | "assistant"
  | "settings";

const STORAGE_PREFIX = "rpg-cr-room-tab:";

export const ROOM_HOME_TAB = {
  id: "main" as const,
  label: "Accueil",
  title: "Table, récit et conversation",
};

/** Onglets à gauche du bouton Accueil (barre dock). */
export const ROOM_DOCK_LEFT_TABS: {
  id: Exclude<RoomSideTab, "main">;
  label: string;
  title: string;
}[] = [
  { id: "sheet", label: "Fiche", title: "Fiche personnage" },
  { id: "companions", label: "Cercle", title: "Compagnons" },
];

/** Onglets à droite du bouton Accueil. */
export const ROOM_DOCK_RIGHT_TABS: {
  id: Exclude<RoomSideTab, "main">;
  label: string;
  title: string;
}[] = [
  { id: "assistant", label: "Aide", title: "Aide personnelle du héros" },
  { id: "settings", label: "Réglages", title: "Préférences et administration" },
];

export function loadRoomSideTab(roomId: string): RoomSideTab {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${roomId}`);
    if (raw === "scene") return "main";
    if (
      raw === "main" ||
      raw === "sheet" ||
      raw === "companions" ||
      raw === "assistant" ||
      raw === "settings"
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "main";
}

export function saveRoomSideTab(roomId: string, tab: RoomSideTab): void {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${roomId}`, tab);
  } catch {
    /* ignore */
  }
}
