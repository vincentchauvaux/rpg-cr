import { narrationCanonContinuityFooter } from "../../canon-continuity.js";
import type { NarrationContext } from "../types.js";

export function buildHostPreambleNarration(ctx: NarrationContext): string {
  const lore = ctx.loreSnippet?.trim()
    ? `\n\n### Lore campagne (export)\n${ctx.loreSnippet.trim().slice(0, 2500)}`
    : "";

  return (
    `[PRÉAMBULE DE PARTIE — hôte ${ctx.hostName ?? "l'hôte"}]\n\n` +
    `L'hôte demande un **préambule** lu par le MJ pour toute la table (narration seule, pas de mécanique).\n\n` +
    `## Objectif\n` +
    `- Poser le **cadre** : monde, lieu de départ, intrigue principale en cours ou à ouvrir.\n` +
    `- **Présenter chaque PJ prêt** à la table à la **2e personne** (vous / tu) : nom + accroche tirée de sa fiche (rang, background, ambition, secret léger si pertinent) — entrée théâtrale, sans tout spoiler. Ce sont des héros, pas des PNJ.\n` +
    `- Ancrer **lieu, ambiance et tension** ; utilise \`<!--scene:{"location":"…","mood":"…","tension":N}\` et \`<!--arc:{"mainPlot":"…","currentBeat":"…"}\` en fin si tu établis ou précises la trame.\n\n` +
    `## Interdictions\n` +
    `- Ne marque **pas** les joueurs comme « déjà présentés en histoire » : les PJ pourront encore faire leur **auto-présentation** à la table.\n` +
    `- Pas de tutoriel, pas de jets, pas de « Thinking Process ».\n` +
    `- **4–6 paragraphes** en français, ton **accessible** (pas de surenchère lyrique) : faits, lieux, personnages, enjeu — une touche d'atmosphère suffit. Puis 1–2 questions ou pistes d'action.\n\n` +
    `## Contexte salon « ${ctx.roomName ?? "—"} »\n` +
    `Graine narrative : \`${ctx.worldSeed ?? "—"}\`\n\n` +
    `### Scène archivée\n${ctx.sceneSummary?.trim() || "_Aucune scène archivée._"}\n\n` +
    `### Trame\n${ctx.trameSummary?.trim() || "_Trame non posée._"}\n\n` +
    `### Personnages prêts\n${ctx.readyPlayersBlock?.trim() || "_Aucun PJ prêt._"}\n\n` +
    `### Journal récent\n${ctx.journalSummary?.trim() || "_—_"}` +
    lore +
    narrationCanonContinuityFooter()
  );
}

export function buildHostRecapNarration(ctx: NarrationContext): string {
  const lore = ctx.loreSnippet?.trim()
    ? `\n\n### Lore (export)\n${ctx.loreSnippet.trim().slice(0, 2000)}`
    : "";

  return (
    `[RÉCAP DE REPRISE — hôte ${ctx.hostName ?? "l'hôte"}]\n\n` +
    `L'hôte reprend une session : le MJ fournit un **récapitulatif** pour remettre tout le monde dans le bain.\n\n` +
    `## Consignes\n` +
    `- Synthèse claire en **3–5 paragraphes** : où en est l'histoire, enjeux, derniers événements marquants, état des PJ (sans révéler secrets non publics).\n` +
    `- Appuie-toi sur le chat récent, le journal et la trame ci-dessous ; ne contredis pas le canon établi.\n` +
    `- Termine par la **situation immédiate** et une ouverture pour jouer (question ou tension présente).\n` +
    `- Pas de mécanique ; **ne change pas** lieu/tension sauf rappel fidèle de l'archive — pas de bloc \`<!--scene:…-->\` si rien n'a bougé.\n\n` +
    `## Contexte\n` +
    `Salon : « ${ctx.roomName ?? "—"} » · Graine : \`${ctx.worldSeed ?? "—"}\`\n\n` +
    `### Scène actuelle\n${ctx.sceneSummary?.trim() || "_—_"}\n\n` +
    `### Trame\n${ctx.trameSummary?.trim() || "_—_"}\n\n` +
    `### Journal\n${ctx.journalSummary?.trim() || "_—_"}\n\n` +
    `### Derniers échanges (table)\n${ctx.recentChatSummary?.trim() || "_Peu de messages._"}\n\n` +
    `### Personnages à la table\n${ctx.readyPlayersBlock?.trim() || "_—_"}` +
    lore +
    narrationCanonContinuityFooter()
  );
}
