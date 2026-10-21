import type { AdventureSlice } from "./types.js";

function cap(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Bloc MJ : nœud + utiles. Budget serré exprès (pas de roman). */
export function formatAdventureSliceForMj(slice: AdventureSlice, maxChars = 2800): string {
  const lines: string[] = [
    `### Aventure (${slice.title})`,
    slice.premise ? `Prémisse : ${cap(slice.premise, 180)}` : "",
    `Échelle : ${slice.tone.scale}. Genre : ${slice.tone.genre.join(", ") || "fantasy"}.`,
  ];
  if (slice.tone.taboos.length) {
    lines.push(`Tabous : ${slice.tone.taboos.join(" ; ")}.`);
  }
  if (slice.calendar?.dayName || slice.now.timeOfDay || slice.now.weather) {
    lines.push(
      `Moment : ${[slice.now.timeOfDay || slice.calendar?.dayName, slice.now.weather].filter(Boolean).join(" — ")}.`
    );
  }
  if (slice.place) {
    lines.push(`Lieu : **${slice.place.name}**${slice.place.hazard ? ` (risque : ${slice.place.hazard})` : ""}.`);
  }
  if (slice.node) {
    lines.push(`Nœud : ${slice.node.title}.`);
    lines.push(slice.node.youAre);
    if (slice.node.props?.length) {
      lines.push(`Objets ici : ${slice.node.props.slice(0, 5).join(", ")}.`);
    }
  }
  if (slice.hooks.length) {
    lines.push("Incidents sous la main :");
    for (const h of slice.hooks) lines.push(`- ${h.text}`);
  }
  if (slice.presentCast.length) {
    lines.push("Présents (rôles, pas des noms hors fiche) :");
    for (const c of slice.presentCast) {
      const name = c.named && c.properName ? c.properName : c.label;
      const want = c.want ? ` — veut : ${c.want}` : "";
      const voice = c.voice ? ` (${c.voice})` : "";
      lines.push(`- ${name}${voice}${want}`);
    }
  }
  if (slice.exits.length) {
    lines.push(
      `Issues : ${slice.exits.map((e) => e.label).join(" / ")}.`
    );
  }
  if (slice.facts.length) {
    lines.push("Faits établis (ne pas inventer au-delà) :");
    for (const f of slice.facts) lines.push(`- ${f.text}`);
  }
  if (slice.clocks.length) {
    lines.push(
      `Horloges : ${slice.clocks.map((c) => `${c.label} ${c.ticks}/${c.max}`).join(" ; ")}.`
    );
  }
  if (slice.quests.length) {
    lines.push(
      `Pistes actives : ${slice.quests.map((q) => q.title).join(" ; ")}.`
    );
  }
  if (slice.items.length) {
    lines.push(`Objets utiles : ${slice.items.map((i) => i.name).join(", ")}.`);
  }
  if (slice.creatures.length) {
    lines.push(
      `Menaces : ${slice.creatures.map((c) => `${c.label} (${c.threat ?? "even"})`).join(" ; ")}.`
    );
  }
  if (slice.factions.length) {
    lines.push(`Factions en jeu : ${slice.factions.map((f) => f.name).join(", ")}.`);
  }
  const m = slice.modules;
  if (m.magic?.traditions?.length) {
    lines.push(
      `Magie (si invoquée) : ${m.magic.traditions.map((t) => `${t.name} — coût ${t.cost}`).join(" ; ")}.`
    );
  }
  if (m.cosmology?.gods?.length) {
    lines.push(
      `Culte utile : ${m.cosmology.gods.map((g) => `${g.name} (${g.domain})`).join(" ; ")}.`
    );
  }
  if (m.law?.authority) {
    lines.push(`Autorité ici : ${m.law.authority}.`);
  }
  if (m.economy?.currency) {
    lines.push(`Monnaie : ${m.economy.currency}.`);
  }
  if (slice.secrets.length) {
    lines.push("Secrets déverrouillés :");
    for (const s of slice.secrets) lines.push(`- ${s.text}`);
  }
  lines.push("Consignes :");
  for (const r of slice.restrictions.slice(0, 8)) lines.push(`- ${r}`);

  const out = lines.filter(Boolean).join("\n");
  if (out.length <= maxChars) return out;
  return `${out.slice(0, maxChars - 20)}\n… [aventure tronquée]`;
}
