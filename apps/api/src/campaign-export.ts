import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatMessage, ProceduralMap, Room, CampaignSummary } from "@rpg-cr/shared";
import { formatSkillsLine, formatStatsLine, NARRATIVE_FACT_LABELS } from "@rpg-cr/shared";
import { getMap, getRoomById, listPlayers, getLastActivity } from "./rooms.js";
import { listMessages } from "./messages.js";
import {
  listQuests,
  listJournal,
  listProposals,
} from "./campaign.js";
import { listPlayerMetaForRoom } from "./player-meta.js";
import { listNpcs } from "./npcs.js";
import { touchRoomActivity } from "./rooms.js";
import { db } from "./db.js";
import { listNarrativeFacts } from "./narrative-facts.js";
import { listSceneLog } from "./room-scene.js";
import { getNarrativeArc } from "./room-narrative-arc.js";
import { formatAlignmentLabel, formatCompanionLoyaltyHint } from "@rpg-cr/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CAMPAIGN_MD_FILES = [
  "README.md",
  "journal.md",
  "lore.md",
  "quetes.md",
  "joueurs.md",
  "pnj.md",
  "anecdotes.md",
  "choix.md",
  "carte.md",
  "chat-archive.md",
  "recit-canon.md",
  "scene.md",
  "trame.md",
] as const;

export type CampaignMdFile = (typeof CAMPAIGN_MD_FILES)[number];

export function getCampaignDataRoot(): string {
  return (
    process.env.CAMPAIGN_DATA_DIR ??
    path.join(__dirname, "..", "data", "campaigns")
  );
}

export function getCampaignDir(roomCode: string): string {
  return path.join(getCampaignDataRoot(), roomCode.toUpperCase());
}

const SAFE_MD = /^[a-z0-9-]+\.md$/i;

export function listGraineFiles(roomCode: string): string[] {
  const dir = getCampaignDir(roomCode);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && SAFE_MD.test(f))
    .sort();
}

export function readGraineFile(roomCode: string, filename: string): string | null {
  if (!SAFE_MD.test(filename)) return null;
  const filePath = path.join(getCampaignDir(roomCode), filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function kindLabel(kind: ChatMessage["kind"]): string {
  switch (kind) {
    case "say":
    case "chat":
      return "DIRE";
    case "action":
      return "ACTION";
    case "mj":
      return "MJ";
    case "system":
      return "SYSTÈME";
    default:
      return String(kind).toUpperCase();
  }
}

function karmaLabel(karma: number): string {
  if (karma >= 5) return "vertu légendaire";
  if (karma >= 2) return "bonne réputation";
  if (karma <= -5) return "infâme";
  if (karma <= -2) return "mauvaise presse";
  return "neutre";
}

function buildReadme(room: Room, map: ProceduralMap | null, exportedAt: string): string {
  return `# Campagne — ${room.name}

| Champ | Valeur |
|-------|--------|
| Code salon | \`${room.code}\` |
| ID | \`${room.id}\` |
| Créée le | ${formatTs(room.createdAt)} |
| Graine carte | ${room.mapSeed} |
| Graine narrative | ${room.worldSeed ?? room.mapSeed} |
| Ouverture campagne | ${room.campaignOpeningDone ? "oui" : "non"} |
| Dernier export | ${formatTs(exportedAt)} |
| LLM configuré | ${room.llmConfig ? `${room.llmConfig.providerId} / ${room.llmConfig.modelId}` : "non"} |

## Index des chroniques

- [journal.md](./journal.md) — chronologie narrative
- [lore.md](./lore.md) — fluff et faits établis
- [quetes.md](./quetes.md) — quêtes
- [joueurs.md](./joueurs.md) — PJ, stats, sorts, karma
- [recit-canon.md](./recit-canon.md) — faits établis par le MJ (canon)
- [scene.md](./scene.md) — lieu, ambiance et tension (timeline)
- [trame.md](./trame.md) — objectif principal et beat narratif actuel
- [pnj.md](./pnj.md) — personnages non-joueurs
- [anecdotes.md](./anecdotes.md) — moments mémorables
- [choix.md](./choix.md) — décisions marquantes
- [carte.md](./carte.md) — territoires et POI
- [chat-archive.md](./chat-archive.md) — historique complet du chat

> Source de vérité campagne : ces fichiers + SQLite. Changer de LLM en god mode ne supprime pas cette graine.
`;
}

function buildJournal(entries: ReturnType<typeof listJournal>): string {
  let md = `# Journal de campagne\n\n`;
  if (!entries.length) {
    md += `_Aucune entrée pour l'instant._\n`;
    return md;
  }
  for (const e of entries) {
    md += `## ${e.title}\n\n`;
    if (e.sessionDay != null) md += `_Jour de session ${e.sessionDay}_ · `;
    md += `${formatTs(e.createdAt)}\n\n${e.body}\n\n---\n\n`;
  }
  return md;
}

function buildLore(
  room: Room,
  map: ProceduralMap | null,
  journal: ReturnType<typeof listJournal>,
  quests: ReturnType<typeof listQuests>,
  mjMessages: ChatMessage[],
  previousLore: string
): string {
  const countries = map?.countries.join(", ") ?? "—";
  const lastJournal = journal.at(-1);
  const activeQuests = quests.filter((q) => q.status === "active");

  let md = `# Lore et ambiance\n\n`;
  md += `## Monde (graine \`${room.mapSeed}\`)\n\n`;
  md += `Royaumes et territoires : **${countries}**.\n\n`;

  if (lastJournal) {
    md += `## Dernier chapitre du journal\n\n**${lastJournal.title}** — ${lastJournal.body}\n\n`;
  }

  if (activeQuests.length) {
    md += `## Fil narratif actuel\n\n`;
    for (const q of activeQuests) {
      md += `- **${q.title}** : ${q.description || "_sans détail_"}\n`;
    }
    md += `\n`;
  }

  const lastMj = mjMessages.slice(-3);
  if (lastMj.length) {
    md += `## Dernières paroles du MJ\n\n`;
    for (const m of lastMj) {
      md += `> ${m.content.replace(/\n/g, "\n> ")}\n\n`;
    }
  }

  if (previousLore.trim()) {
    md += `## Notes conservées (export précédent)\n\n${previousLore.split("## Notes conservées")[0].replace(/^# Lore[\s\S]*?(?=## |$)/, "").trim() || previousLore}\n\n`;
  }

  md += `## Mise à jour automatique\n\n`;
  md += `_Snapshot du ${formatTs(new Date().toISOString())} — heuristique sans LLM._\n`;
  return md;
}

function buildQuests(quests: ReturnType<typeof listQuests>): string {
  let md = `# Quêtes\n\n`;
  const groups: Record<string, typeof quests> = {
    active: quests.filter((q) => q.status === "active"),
    completed: quests.filter((q) => q.status === "completed"),
    failed: quests.filter((q) => q.status === "failed"),
  };
  const titles: Record<string, string> = {
    active: "En cours",
    completed: "Accomplies",
    failed: "Échouées",
  };
  for (const [status, list] of Object.entries(groups)) {
    md += `## ${titles[status] ?? status}\n\n`;
    if (!list.length) {
      md += `_Aucune._\n\n`;
      continue;
    }
    for (const q of list) {
      md += `### ${q.title}\n\n${q.description || "_—_"}\n\n`;
      md += `_Mise à jour : ${formatTs(q.updatedAt)}_\n\n`;
    }
  }
  return md;
}

function buildJoueurs(
  players: ReturnType<typeof listPlayers>,
  metas: ReturnType<typeof listPlayerMetaForRoom>
): string {
  let md = `# Personnages joueurs\n\n`;
  const humans = players.filter((p) => p.kind === "human");
  for (const p of humans) {
    const meta = metas.find((m) => m.playerId === p.id) ?? {
      playerId: p.id,
      karma: 0,
      parcours: "",
      notes: "",
    };
    md += `## ${p.name}\n\n`;
    md += `- **Rôle** : ${p.role === "admin" ? "hôte / MJ" : "aventurier"}\n`;
    md += `- **Couleur** : ${p.displayColor ?? "—"}\n`;
    md += `- **Statut fiche** : ${p.characterStatus}\n`;
    md += `- **Karma** : ${meta.karma} (${karmaLabel(meta.karma)})\n`;
    md += `- **Rejoint** : ${formatTs(p.joinedAt)}\n\n`;
    const s = p.characterSheet;
    if (s.alignment) md += `- **Alignement** : ${formatAlignmentLabel(s.alignment)}\n`;
    if (s.rank) md += `- **Rang** : ${s.rank}\n`;
    if (s.background) md += `- **Background** : ${s.background}\n`;
    if (s.family) md += `- **Famille** : ${s.family}\n`;
    if (s.secret) md += `- **Secret** : ${s.secret}\n`;
    if (s.ambition) md += `- **Ambition / intrigue** : ${s.ambition}\n`;
    const statLine = formatStatsLine(s.stats);
    if (statLine) md += `- **Caractéristiques** : ${statLine}\n`;
    const skillsLine = formatSkillsLine(s);
    if (skillsLine) md += `- **Compétences** : ${skillsLine}\n`;
    md += `\n### Capacités\n\n`;
    if (s.spells?.length) {
      md += `#### Sorts & pouvoirs\n\n`;
      for (const sp of s.spells) {
        md += `- **${sp.name}**${sp.uses ? ` (${sp.uses})` : ""} — ${sp.description || "—"}\n`;
      }
      md += `\n`;
    }
    if (s.attackTypes?.length) {
      md += `#### Attaques\n\n`;
      for (const a of s.attackTypes) {
        md += `- **${a.name}**${a.damage ? ` · ${a.damage}` : ""}${a.range ? ` · ${a.range}` : ""} — ${a.description || "—"}\n`;
      }
      md += `\n`;
    }
    if (s.actions?.length) {
      md += `#### Actions\n\n`;
      for (const a of s.actions) {
        md += `- **[${a.type}] ${a.name}** — ${a.description || "—"}\n`;
      }
      md += `\n`;
    }
    if (s.usableItems?.length) {
      md += `#### Objets utilisables\n\n`;
      for (const u of s.usableItems) {
        md += `- **${u.name}**${u.quantity ? ` ×${u.quantity}` : ""} — ${u.description || "—"}\n`;
      }
      md += `\n`;
    }
    md += `### Inventaire & biens\n\n`;
    md += `- **Équipement** : ${s.equipment?.trim() || "—"}\n`;
    md += `- **Inventaire** : ${s.inventory?.trim() || "—"}\n`;
    md += `- **Possessions** : ${s.possessions?.trim() || "—"}\n`;
    md += `- **Habitat** : ${s.habitat?.trim() || "—"}\n`;
    md += `- **Domestiques** : ${s.servants?.trim() || "—"}\n`;
    md += `- **Argent** : ${s.money?.trim() || "—"}\n`;
    md += `- **Monture** : ${s.mount?.trim() || "—"}\n\n`;
    md += `### Parcours\n\n${meta.parcours.trim() || s.background?.trim() || "_À compléter._"}\n\n`;
    md += `### Notes\n\n${meta.notes.trim() || "_—_"}\n\n---\n\n`;
  }
  return md;
}

function buildPnj(
  npcs: ReturnType<typeof listNpcs>,
  aiPlayers: ReturnType<typeof listPlayers>
): string {
  let md = `# Personnages non-joueurs\n\n`;
  const puppets = aiPlayers.filter((p) => p.kind === "ai_puppet");
  if (puppets.length) {
    md += `## Marionnettes IA (cercle narratif)\n\n`;
    for (const p of puppets) {
      const statusLabel =
        p.circleStatus === "pending"
          ? "En attente d'introduction"
          : p.circleStatus === "withdrawn"
            ? "En retrait"
            : "Actif au cercle";
      md += `### ${p.name}\n\n`;
      md += `- **Statut** : ${statusLabel}\n`;
      md += `- **Couleur** : ${p.displayColor ?? "—"}\n`;
      md += `- **Depuis** : ${formatTs(p.joinedAt)}\n`;
      const s = p.characterSheet;
      if (s.alignment) md += `- **Alignement** : ${formatAlignmentLabel(s.alignment)}\n`;
      if (s.personality) md += `- **Caractère** : ${s.personality}\n`;
      if (s.companionBond) md += `- **Lien de route** : ${s.companionBond}\n`;
      if (s.companionAgenda) md += `- **Agenda** : ${s.companionAgenda}\n`;
      if (s.companionLoyalty != null || s.companionStance) {
        md += `- **Loyauté** : ${formatCompanionLoyaltyHint(s)}\n`;
      }
      if (s.background) md += `- **Background** : ${s.background}\n`;
      if (s.secret) md += `- **Secret** : ${s.secret}\n`;
      if (s.ambition) md += `- **Ambition** : ${s.ambition}\n`;
      md += `\n---\n\n`;
    }
  }
  if (!npcs.length && !puppets.length) {
    md += `_Aucun PNJ enregistré._\n`;
    return md;
  }
  if (npcs.length) {
    md += `## PNJ catalogués\n\n`;
    for (const n of npcs) {
      md += `### ${n.name}\n\n${n.description || "_—_"}\n\n`;
      if (n.relations.trim()) md += `**Relations** : ${n.relations}\n\n`;
      md += `---\n\n`;
    }
  }
  return md;
}

function buildTrame(roomId: string): string {
  const arc = getNarrativeArc(roomId);
  let md = `# Trame de campagne\n\n`;
  if (!arc) {
    md += `_Trame non encore établie — le MJ la pose au « Commencer » ou en introduction._\n`;
    return md;
  }
  md += `- **Établie le** : ${formatTs(arc.introducedAt)}\n\n`;
  md += `## Objectif / conflit principal\n\n${arc.mainPlot || "—"}\n\n`;
  md += `## Beat narratif actuel\n\n${arc.currentBeat || "—"}\n\n`;
  return md;
}

function buildScene(roomId: string): string {
  const log = listSceneLog(roomId, 500);
  let md = `# Scène — lieu, ambiance et tension\n\n`;
  md += `_Tension : −100 (périlleux) … 0 (neutre) … +100 (serein). Mises à jour après chaque récit MJ._\n\n`;
  if (!log.length) {
    md += `_Aucune entrée archivée — la scène se remplit au fil des réponses du MJ._\n`;
    return md;
  }
  for (const e of log) {
    md += `## ${formatTs(e.updatedAt)}\n\n`;
    md += `- **Lieu** : ${e.location || "—"}\n`;
    md += `- **Ambiance** : ${e.mood || "—"}\n`;
    md += `- **Tension** : ${e.tension}\n\n`;
    md += `---\n\n`;
  }
  return md;
}

function buildRecitCanon(roomId: string): string {
  const facts = listNarrativeFacts(roomId, 500);
  let md = `# Récit canon — faits établis par le MJ\n\n`;
  md += `_Ce que le MJ a dit devient réalité persistante pour la campagne._\n\n`;
  if (!facts.length) {
    md += `_Aucun fait archivé — ils s'accumulent après les réponses MJ (extraction auto ou god mode)._ \n`;
    return md;
  }
  for (const f of facts) {
    const label = NARRATIVE_FACT_LABELS[f.factType] ?? f.factType;
    md += `## ${formatTs(f.createdAt)} — ${label}\n\n`;
    md += `${f.summary}\n\n`;
    if (Object.keys(f.payload).length) {
      md += `<details><summary>Détails</summary>\n\n\`\`\`json\n${JSON.stringify(f.payload, null, 2)}\n\`\`\`\n\n</details>\n\n`;
    }
    md += `---\n\n`;
  }
  return md;
}

function buildAnecdotes(messages: ChatMessage[]): string {
  const picks = messages.filter(
    (m) =>
      m.kind === "action" ||
      m.kind === "mj" ||
      (m.kind === "system" && m.content.length > 40)
  );
  let md = `# Anecdotes à retenir\n\n`;
  md += `_Moments saillants extraits du chat (actions, MJ, événements)._ \n\n`;
  if (!picks.length) {
    md += `_Rien de mémorable encore — continuez l'aventure._\n`;
    return md;
  }
  for (const m of picks.slice(-40)) {
    md += `- **${formatTs(m.createdAt)}** · ${m.playerName} (${kindLabel(m.kind)}) : ${m.content.replace(/\n/g, " ")}\n`;
  }
  return md;
}

function buildChoix(proposals: ReturnType<typeof listProposals>): string {
  let md = `# Choix qui influencent la partie\n\n`;
  md += `_Propositions archivées des joueurs._\n\n`;
  if (!proposals.length) {
    md += `_Aucune décision archivée pour l'instant._\n`;
    return md;
  }
  for (const p of proposals) {
    md += `## ${p.playerName} — ${formatTs(p.archivedAt)}\n\n${p.content}\n\n---\n\n`;
  }
  return md;
}

function buildCarte(map: ProceduralMap | null, room: Room): string {
  let md = `# Carte du monde\n\n`;
  if (!map) {
    md += `_Carte non disponible._\n`;
    return md;
  }
  md += `- **Graine** : \`${map.seed}\`\n`;
  md += `- **Dimensions** : ${map.width}×${map.height}\n`;
  md += `- **Pays** : ${map.countries.join(", ")}\n\n`;
  md += `## Points d'intérêt\n\n`;
  for (const p of map.pois) {
    md += `- **${p.name}** (${p.type}) — ${p.country ?? "?"}\n`;
  }
  md += `\n## Territoires\n\n`;
  for (const t of map.territories) {
    md += `- ${t.name} (${t.country})\n`;
  }
  md += `\n## SVG\n\n`;
  md += `Le rendu complet est stocké en base (\`map_json\`). Graine salon : \`${room.mapSeed}\`.\n`;
  return md;
}

function buildChatArchive(messages: ChatMessage[]): string {
  let md = `# Archive du chat\n\n`;
  md += `_Export horodaté — types DIRE / ACTION / MJ / SYSTÈME._\n\n`;
  for (const m of messages) {
    md += `**[${formatTs(m.createdAt)}]** \`${kindLabel(m.kind)}\` **${m.playerName}** : ${m.content}\n\n`;
  }
  return md;
}

function readExistingLore(dir: string): string {
  const lorePath = path.join(dir, "lore.md");
  if (!fs.existsSync(lorePath)) return "";
  return fs.readFileSync(lorePath, "utf8");
}

export function readCampaignContext(roomCode: string): {
  lore: string;
  journal: string;
} {
  const dir = getCampaignDir(roomCode);
  const read = (file: string) => {
    const p = path.join(dir, file);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  };
  return { lore: read("lore.md"), journal: read("journal.md") };
}

export function hasCampaignExport(roomCode: string): boolean {
  return fs.existsSync(path.join(getCampaignDir(roomCode), "README.md"));
}

export function exportCampaign(roomId: string): {
  dir: string;
  roomCode: string;
  files: CampaignMdFile[];
  exportedAt: string;
} {
  const room = getRoomById(roomId);
  if (!room) throw new Error("Salon introuvable");

  const dir = getCampaignDir(room.code);
  fs.mkdirSync(dir, { recursive: true });

  const exportedAt = new Date().toISOString();
  const map = getMap(roomId);
  const messages = listMessages(roomId, 5000);
  const journal = listJournal(roomId);
  const quests = listQuests(roomId);
  const proposals = listProposals(roomId);
  const players = listPlayers(roomId);
  const metas = listPlayerMetaForRoom(roomId);
  const npcs = listNpcs(roomId);
  const mjMessages = messages.filter((m) => m.kind === "mj");
  const previousLore = readExistingLore(dir);

  const files: Record<CampaignMdFile, string> = {
    "README.md": buildReadme(room, map, exportedAt),
    "journal.md": buildJournal(journal),
    "lore.md": buildLore(room, map, journal, quests, mjMessages, previousLore),
    "quetes.md": buildQuests(quests),
    "joueurs.md": buildJoueurs(players, metas),
    "pnj.md": buildPnj(npcs, players),
    "anecdotes.md": buildAnecdotes(messages),
    "choix.md": buildChoix(proposals),
    "carte.md": buildCarte(map, room),
    "chat-archive.md": buildChatArchive(messages),
    "recit-canon.md": buildRecitCanon(roomId),
    "scene.md": buildScene(roomId),
    "trame.md": buildTrame(roomId),
  };

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, "utf8");
  }

  touchRoomActivity(roomId, exportedAt);

  return {
    dir,
    roomCode: room.code,
    files: CAMPAIGN_MD_FILES.slice(),
    exportedAt,
  };
}

function rowToRoom(row: Record<string, unknown>): Room {
  return {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    mapSeed: row.map_seed as string,
    llmConfig: row.llm_config
      ? (JSON.parse(row.llm_config as string) as Room["llmConfig"])
      : null,
  };
}

export function listCampaignSummaries(codes: string[]): CampaignSummary[] {
  const normalized = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (!normalized.length) return [];

  const placeholders = normalized.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT r.*,
        (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id) AS message_count
       FROM rooms r
       WHERE r.code IN (${placeholders}) COLLATE NOCASE`
    )
    .all(...normalized) as Record<string, unknown>[];

  return rows.map((row) => {
    const room = rowToRoom(row);
    return {
      room,
      lastActivityAt: getLastActivity(room.id),
      messageCount: Number(row.message_count ?? 0),
      hasMarkdownExport: hasCampaignExport(room.code),
    };
  });
}
