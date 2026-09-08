import {
  STAT_LABELS,
  type StatKey,
} from "./character-sheet.js";
import type { SceneCheckMode, SceneCheckSpec } from "./scene-choice.js";

export type SceneCheckStance = "help" | "oppose";

export type SceneCheckRoll = {
  playerId: string;
  playerName: string;
  stance: "actor" | "help" | "oppose";
  ability: StatKey;
  natural: number;
  naturalAlt?: number;
  modifier: number;
  total: number;
};

export type SceneCheckPublic = {
  id: string;
  roomId: string;
  sourceMessageId: string;
  choice: string;
  ability: StatKey;
  abilityLabel: string;
  skillHint: string;
  mode: SceneCheckMode;
  dc: number;
  actorPlayerId: string;
  actorPlayerName: string;
  expiresAt: number;
  helpers: Array<{ playerId: string; playerName: string; ability: StatKey }>;
  opposers: Array<{ playerId: string; playerName: string; ability: StatKey }>;
  status: "open" | "resolved";
};

export const HELP_DC = 10;

export type SceneCheckOutcomeKind =
  | "success"
  | "failure"
  | "contest_win"
  | "contest_loss"
  | "tie";

export type ResolvedSceneCheck = {
  choice: string;
  ability: StatKey;
  abilityLabel: string;
  skillHint: string;
  mode: SceneCheckMode;
  dc: number;
  spec: SceneCheckSpec;
  actor: SceneCheckRoll;
  helpers: SceneCheckRoll[];
  opposers: SceneCheckRoll[];
  usedAdvantage: boolean;
  worldNatural?: number;
  worldMod?: number;
  worldTotal?: number;
  oppositionTotal?: number;
  outcome: SceneCheckOutcomeKind;
  outcomeLine: string;
};

function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function rollD20(rng: () => number): number {
  return Math.floor(rng() * 20) + 1;
}

export function rollAbilityCheck(
  modifier: number,
  rng: () => number = Math.random
): { natural: number; total: number } {
  const natural = rollD20(rng);
  return { natural, total: natural + modifier };
}

export function rollAbilityPair(
  modifier: number,
  rng: () => number = Math.random
): { first: number; second: number; kept: number; total: number } {
  const first = rollD20(rng);
  const second = rollD20(rng);
  const kept = Math.max(first, second);
  return { first, second, kept, total: kept + modifier };
}

export function helperGrantsAdvantage(helperTotal: number): boolean {
  return helperTotal >= HELP_DC;
}

export function resolveSceneCheckOutcome(input: {
  actorKeptNatural: number;
  actorModifier: number;
  actorTotal: number;
  dc: number;
  mode: SceneCheckMode;
  opposers: Array<{ total: number }>;
  worldTotal?: number;
}): {
  outcome: SceneCheckOutcomeKind;
  outcomeLine: string;
  oppositionTotal?: number;
} {
  const { actorKeptNatural, actorTotal, dc, mode, opposers, worldTotal } = input;
  const playerOpp = opposers.reduce((m, o) => Math.max(m, o.total), 0);
  const contested =
    mode === "opposed" || opposers.length > 0;

  if (!contested) {
    const ok = actorTotal >= dc;
    const crit =
      actorKeptNatural === 20
        ? " — 20 naturel"
        : actorKeptNatural === 1
          ? " — 1 naturel"
          : "";
    if (ok) {
      return {
        outcome: "success",
        outcomeLine: `réussite (${actorTotal} ≥ DD ${dc}${crit}).`,
      };
    }
    return {
      outcome: "failure",
      outcomeLine: `échec (${actorTotal} < DD ${dc}${crit}).`,
    };
  }

  const oppositionParts: number[] = [];
  if (opposers.length > 0) oppositionParts.push(playerOpp);
  if (mode === "opposed" && worldTotal != null) oppositionParts.push(worldTotal);
  const oppositionTotal =
    oppositionParts.length > 0 ? Math.max(...oppositionParts) : (worldTotal ?? dc);

  const crit =
    actorKeptNatural === 20
      ? " (20 naturel)"
      : actorKeptNatural === 1
        ? " (1 naturel)"
        : "";

  if (actorTotal > oppositionTotal) {
    return {
      outcome: "contest_win",
      oppositionTotal,
      outcomeLine: `l'emporte ${actorTotal} contre ${oppositionTotal}${crit}.`,
    };
  }
  if (actorTotal < oppositionTotal) {
    return {
      outcome: "contest_loss",
      oppositionTotal,
      outcomeLine: `l'opposition l'emporte ${oppositionTotal} contre ${actorTotal}${crit}.`,
    };
  }
  return {
    outcome: "tie",
    oppositionTotal,
    outcomeLine: `égalité ${actorTotal} partout — la situation ne bascule pas${crit}.`,
  };
}

export function formatSceneCheckActionMessage(resolved: ResolvedSceneCheck): string {
  const skill = resolved.skillHint ? ` (${resolved.skillHint})` : "";
  const contested =
    resolved.mode === "opposed" || resolved.opposers.length > 0;
  const header = contested
    ? `Jet D&D 5e — ${resolved.abilityLabel}${skill}, jet contesté.`
    : `Jet D&D 5e — ${resolved.abilityLabel}${skill} contre DD ${resolved.dc}.`;

  const actor = resolved.actor;
  const kept = actor.natural;
  const adv =
    resolved.usedAdvantage && actor.naturalAlt != null
      ? ` (avantage : ${Math.min(kept, actor.naturalAlt)} et ${Math.max(kept, actor.naturalAlt)})`
      : "";

  const lines = [
    `Je tente : « ${resolved.choice} ».`,
    header,
    `Je lance un d20 sur ma ${resolved.abilityLabel.toLowerCase()} : ${kept} ${formatMod(actor.modifier)} = ${actor.total}${adv}.`,
  ];

  for (const h of resolved.helpers) {
    const ok = helperGrantsAdvantage(h.total)
      ? "réussite, avantage accordé"
      : "échec, pas d'avantage";
    lines.push(
      `[${h.playerName}] aide — ${STAT_LABELS[h.ability]} : ${h.natural} ${formatMod(h.modifier)} = ${h.total} (${ok}).`
    );
  }
  for (const o of resolved.opposers) {
    lines.push(
      `[${o.playerName}] s'oppose — ${STAT_LABELS[o.ability]} : ${o.natural} ${formatMod(o.modifier)} = ${o.total}.`
    );
  }
  if (
    contested &&
    resolved.worldNatural != null &&
    resolved.worldMod != null &&
    resolved.worldTotal != null &&
    resolved.mode === "opposed"
  ) {
    lines.push(
      `Opposition du monde : ${resolved.worldNatural} ${formatMod(resolved.worldMod)} = ${resolved.worldTotal}.`
    );
  }
  lines.push(`Résultat : ${resolved.outcomeLine}`);
  return lines.join("\n");
}

export function toSceneCheckPublic(input: {
  id: string;
  roomId: string;
  sourceMessageId: string;
  choice: string;
  spec: SceneCheckSpec;
  actorPlayerId: string;
  actorPlayerName: string;
  expiresAt: number;
  helpers: Array<{ playerId: string; playerName: string; ability: StatKey }>;
  opposers: Array<{ playerId: string; playerName: string; ability: StatKey }>;
  status?: "open" | "resolved";
}): SceneCheckPublic {
  return {
    id: input.id,
    roomId: input.roomId,
    sourceMessageId: input.sourceMessageId,
    choice: input.choice,
    ability: input.spec.ability,
    abilityLabel: STAT_LABELS[input.spec.ability],
    skillHint: input.spec.skillHint,
    mode: input.spec.mode,
    dc: input.spec.dc,
    actorPlayerId: input.actorPlayerId,
    actorPlayerName: input.actorPlayerName,
    expiresAt: input.expiresAt,
    helpers: input.helpers,
    opposers: input.opposers,
    status: input.status ?? "open",
  };
}

export function isSceneCheckActionContent(content: string): boolean {
  return /Jet D&D 5e/i.test(content);
}
