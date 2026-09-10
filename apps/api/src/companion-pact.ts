import type { CharacterSheet, CompanionDirective, Player } from "@rpg-cr/shared";
import {
  companionStanceFromLoyalty,
  matchNamedAiPlayer,
  mergeCharacterSheet,
  parseCharacterSheetJson,
  sheetHasStructuredContent,
} from "@rpg-cr/shared";
import {
  createAiPlayer,
  getPlayerById,
  getRoomById,
  listPlayers,
  setAiPlayerCircleStatus,
  setPlayerIntroducedInStory,
} from "./rooms.js";
import { finalizeCharacter, updateCharacter } from "./character.js";
import { runMjTurn } from "./mj.js";
import { resolveRoomApiKey } from "./llm-api-key.js";
import { queueInteractiveLlm } from "./room-llm-queue.js";
import { broadcastPlayers, mjThinkingBegin, mjThinkingEnd } from "./ws-hub.js";

function pactSheetPatch(d: CompanionDirective): Partial<CharacterSheet> {
  const loyalty = d.loyalty ?? (d.action === "recruit" ? 40 : undefined);
  const stance =
    d.action === "betray"
      ? "hostile"
      : d.action === "leave"
        ? companionStanceFromLoyalty(loyalty ?? 0)
        : companionStanceFromLoyalty(loyalty);
  const patch: Partial<CharacterSheet> = {};
  if (d.personality) patch.personality = d.personality;
  if (d.bond) patch.companionBond = d.bond;
  if (d.agenda) patch.companionAgenda = d.agenda;
  if (loyalty != null) patch.companionLoyalty = loyalty;
  if (stance) patch.companionStance = stance;
  if (d.reason && d.action !== "recruit") {
    patch.notes = d.reason;
  }
  if (d.action === "recruit" && !d.personality) {
    patch.personality = "Caractère encore à découvrir — le MJ l'incarnera.";
  }
  if (d.action === "recruit" && !patch.companionBond) {
    patch.companionBond = "A accepté de faire route avec le groupe.";
  }
  return patch;
}

function activateCompanion(player: Player, d: CompanionDirective): Player | null {
  const patch = pactSheetPatch(d);
  if (d.action === "recruit" && !player.characterSheet.rank?.trim()) {
    patch.rank = "Compagnon de route";
  }
  updateCharacter(
    player.id,
    {
      characterStatus: "ready",
      characterSheet: patch,
    },
    { allowStoryEdit: true }
  );
  setAiPlayerCircleStatus(player.id, "active");
  finalizeCharacter(player.id);
  setPlayerIntroducedInStory(player.id);
  return getPlayerById(player.id);
}

function applyRecruit(roomId: string, d: CompanionDirective): boolean {
  const humans = listPlayers(roomId).filter((p) => p.kind === "human");
  if (humans.some((p) => p.name.trim().toLowerCase() === d.name.trim().toLowerCase())) {
    return false;
  }
  let puppet = matchNamedAiPlayer(listPlayers(roomId), d.name);
  if (!puppet) {
    puppet = createAiPlayer(roomId, d.name);
  }
  if (!puppet) return false;
  const updated = activateCompanion(puppet, d);
  if (!updated) return false;
  if (!sheetHasStructuredContent(updated.characterSheet)) {
    scheduleCompanionSheetFill(roomId, updated);
  }
  return true;
}

function applyLeave(roomId: string, d: CompanionDirective): boolean {
  const puppet = matchNamedAiPlayer(listPlayers(roomId), d.name);
  if (!puppet) return false;
  const patch = pactSheetPatch({ ...d, loyalty: d.loyalty ?? 0 });
  updateCharacter(
    puppet.id,
    {
      characterSheet: {
        ...patch,
        notes: [puppet.characterSheet.notes, d.reason ? `A quitté le groupe : ${d.reason}` : ""]
          .filter((x) => x?.trim())
          .join("\n"),
      },
    },
    { allowStoryEdit: true }
  );
  setAiPlayerCircleStatus(puppet.id, "withdrawn");
  return true;
}

function applyBetray(roomId: string, d: CompanionDirective): boolean {
  const puppet = matchNamedAiPlayer(listPlayers(roomId), d.name);
  if (!puppet) return false;
  const loyalty = d.loyalty ?? Math.min(puppet.characterSheet.companionLoyalty ?? 0, -40);
  updateCharacter(
    puppet.id,
    {
      characterSheet: {
        companionLoyalty: loyalty,
        companionStance: "hostile",
        notes: [puppet.characterSheet.notes, d.reason ? `Trahison : ${d.reason}` : ""]
          .filter((x) => x?.trim())
          .join("\n"),
      },
    },
    { allowStoryEdit: true }
  );
  if (d.depart) {
    setAiPlayerCircleStatus(puppet.id, "withdrawn");
  } else if (puppet.circleStatus !== "active") {
    setAiPlayerCircleStatus(puppet.id, "active");
  }
  return true;
}

/** Applique les blocs `<!--companion:…-->` après un tour MJ (sans second récit d'intro). */
export function applyCompanionDirectives(
  roomId: string,
  directives: CompanionDirective[] | undefined
): void {
  if (!directives?.length) return;
  let changed = false;
  for (const d of directives) {
    if (d.action === "recruit") changed = applyRecruit(roomId, d) || changed;
    else if (d.action === "leave") changed = applyLeave(roomId, d) || changed;
    else if (d.action === "betray") changed = applyBetray(roomId, d) || changed;
  }
  if (changed) {
    broadcastPlayers(roomId, listPlayers(roomId));
  }
}

function scheduleCompanionSheetFill(roomId: string, player: Player): void {
  const room = getRoomById(roomId);
  if (!room?.llmConfig) return;

  const personality = player.characterSheet.personality?.trim() || "à inventer";
  const bond = player.characterSheet.companionBond?.trim() || "";
  const agenda = player.characterSheet.companionAgenda?.trim() || "";
  const prompt =
    `[FICHE COMPAGNON DE ROUTE] Nom : « ${player.name} ».\n` +
    `Caractère déjà établi : ${personality}.\n` +
    (bond ? `Lien de route : ${bond}.\n` : "") +
    (agenda ? `Agenda parallèle (secret) : ${agenda}.\n` : "") +
    "Complète une fiche D&D 5e cohérente (pas un PJ humain). Conserve caractère, lien et agenda.\n" +
    "Réponds UNIQUEMENT avec un objet JSON valide (français) : " +
    "alignment, rank, background, family, secret, ambition, inventory, equipment, possessions, money, mount, notes, " +
    "stats (force,dexterite,constitution,intelligence,sagesse,charisme), spells[], attackTypes[], actions[], usableItems[].";

  mjThinkingBegin(roomId, { kind: "background" });
  void (async () => {
    try {
      await queueInteractiveLlm(roomId, "companion-sheet", async () => {
        const { content } = await runMjTurn(
          roomId,
          room.llmConfig!,
          prompt,
          resolveRoomApiKey(room.llmConfig)
        );
        const generated = parseCharacterSheetJson(content, "companion-sheet");
        const current = getPlayerById(player.id);
        if (!current) return;
        const preserved: Partial<CharacterSheet> = {
          personality: current.characterSheet.personality,
          companionBond: current.characterSheet.companionBond,
          companionAgenda: current.characterSheet.companionAgenda,
          companionLoyalty: current.characterSheet.companionLoyalty,
          companionStance: current.characterSheet.companionStance,
        };
        const merged = mergeCharacterSheet(current.characterSheet, {
          ...generated,
          ...preserved,
        });
        updateCharacter(
          player.id,
          { characterStatus: "ready", characterSheet: merged },
          { allowStoryEdit: true }
        );
        finalizeCharacter(player.id);
        broadcastPlayers(roomId, listPlayers(roomId));
      });
    } catch (err) {
      console.warn("[companion-pact] fiche compagnon incomplète", {
        roomId,
        name: player.name,
        err: err instanceof Error ? err.message : err,
      });
    }     finally {
      mjThinkingEnd(roomId, { kind: "background" });
    }
  })();
}
