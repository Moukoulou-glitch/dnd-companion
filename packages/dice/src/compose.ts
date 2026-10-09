import { parseFormula, type Term } from "./formula.js";
import { critFormula, roll, scriptedRng, secureRng, type Rng, type RollResult } from "./roll.js";

/**
 * The roll composer's inputs, shaped like the engine's RollBreakdown so the
 * app can pass breakdowns straight in (structural, no engine dependency).
 */
export interface ComposerBase {
  total: number;
  parts: { label: string; value: number }[];
  dice: { label: string; dice: string; damageType?: string }[];
  advantage: string[];
  disadvantage: string[];
  suggestions: {
    label: string;
    effect: string;
    reason?: string;
    apply: { flat: number; dice: string[]; damageType?: string; mode?: "advantage" | "disadvantage"; weaponDice?: string };
  }[];
  critAt?: number;
  minD20?: number;
  /** Sources that make the roll fail automatically; the composer warns but still lets you roll. */
  autoFail?: string[];
  /** Reminders shown with the roll. */
  notes?: string[];
  /** Damage dice of these types count as at least `value` each (Elemental Adept). */
  minDie?: { value: number; types: string[]; label: string };
}

/** What the player changed in the composer. */
export interface ComposerChoices {
  /** Labels of the optional modifiers turned on. */
  enabled: string[];
  /** Advantage or disadvantage the player adds by hand (a DM ruling, an ally's Help). */
  manual: "none" | "advantage" | "disadvantage";
  /** Flat bonus or penalty typed by hand. */
  extra: number;
  /**
   * The player's final say on the d20: overrides what the sources add up to
   * (the composer starts from the sources' result and the player can change it).
   */
  force?: "advantage" | "disadvantage" | "normal";
}

export const noChoices: ComposerChoices = { enabled: [], manual: "none", extra: 0 };

/** A formula plus, for each term, the source the player should see beside it. */
export interface Composed {
  terms: Term[];
  sources: string[];
  /** "advantage", "disadvantage", or "normal" after the 2014 cancelling rule. */
  d20Mode?: "advantage" | "disadvantage" | "normal";
  /** Why the d20 mode is what it is, e.g. ["Steady Aim"] vs ["Poisoned"]. */
  advantageFrom: string[];
  disadvantageFrom: string[];
}

/** Adds every term of a dice expression ("3d4+3"); dice terms get the damage type as their label. */
function pushDice(out: Composed, dice: string, source: string, type?: string) {
  for (const t of parseFormula(dice)) {
    out.terms.push(t.kind === "dice" && type ? { ...t, label: type } : t);
    out.sources.push(source);
  }
}

function pushFlat(out: Composed, value: number, source: string) {
  if (value === 0) return;
  out.terms.push({ kind: "flat", sign: value < 0 ? -1 : 1, value: Math.abs(value) });
  out.sources.push(source);
}

/** Builds a d20 roll (attack, save, check, initiative) from a breakdown and the player's choices. */
export function composeD20(base: ComposerBase, choices: ComposerChoices = noChoices): Composed {
  const on = base.suggestions.filter((s) => choices.enabled.includes(s.label));
  const adv = [...base.advantage, ...on.filter((s) => s.apply.mode === "advantage").map((s) => s.label)];
  const dis = [...base.disadvantage, ...on.filter((s) => s.apply.mode === "disadvantage").map((s) => s.label)];
  if (choices.manual === "advantage") adv.push("Added by hand");
  if (choices.manual === "disadvantage") dis.push("Added by hand");

  // 2014: any advantage and any disadvantage cancel out, however many of each.
  const mode = choices.force ?? (adv.length && !dis.length ? "advantage" : dis.length && !adv.length ? "disadvantage" : "normal");
  const out: Composed = { terms: [], sources: [], d20Mode: mode, advantageFrom: adv, disadvantageFrom: dis };

  const d20: Term = { kind: "dice", sign: 1, count: mode === "normal" ? 1 : 2, sides: 20 };
  if (mode !== "normal") d20.keep = { which: mode === "advantage" ? "highest" : "lowest", n: 1 };
  if (base.critAt) d20.critAtOrAbove = base.critAt;
  if (base.minD20) d20.min = base.minD20;
  out.terms.push(d20);
  out.sources.push(mode === "normal" ? "d20" : `d20, ${mode}`);

  for (const p of base.parts) pushFlat(out, p.value, p.label);
  for (const d of base.dice) pushDice(out, d.dice, d.label);
  for (const s of on) {
    pushFlat(out, s.apply.flat, s.label);
    for (const d of s.apply.dice) pushDice(out, d, s.label);
  }
  pushFlat(out, choices.extra, "Added by hand");
  return out;
}

/**
 * Builds a damage roll: weapon dice of the weapon's type, flat bonuses,
 * extra dice (each with its own type when it has one), and the player's
 * optional modifiers.
 */
export function composeDamage(
  weaponDice: string,
  damageType: string,
  base: ComposerBase,
  choices: ComposerChoices = noChoices,
  /** What the main dice are called in the breakdown: "Weapon", or a spell's name. */
  label = "Weapon",
): Composed {
  const out: Composed = { terms: [], sources: [], advantageFrom: [], disadvantageFrom: [] };
  // An option can change the weapon's own die (Shillelagh: a d8).
  const swap = base.suggestions.find((x) => choices.enabled.includes(x.label) && x.apply.weaponDice);
  pushDice(out, swap?.apply.weaponDice ?? weaponDice, swap ? `${label} (${swap.label})` : label, damageType || undefined);
  for (const p of base.parts) pushFlat(out, p.value, p.label);
  for (const d of base.dice) pushDice(out, d.dice, d.label, d.damageType ?? damageType);
  for (const s of base.suggestions.filter((x) => choices.enabled.includes(x.label))) {
    pushFlat(out, s.apply.flat, s.label);
    for (const d of s.apply.dice) pushDice(out, d, s.label, s.apply.damageType ?? damageType);
  }
  pushFlat(out, choices.extra, "Added by hand");
  // Elemental Adept: each die of the chosen type counts as at least the minimum.
  if (base.minDie) {
    const md = base.minDie;
    out.terms = out.terms.map((t, i) => {
      if (t.kind !== "dice" || !t.label || !md.types.includes(t.label)) return t;
      out.sources[i] = `${out.sources[i]} (${md.label}: each die at least ${md.value})`;
      return { ...t, min: Math.max(t.min ?? 0, md.value) };
    });
  }
  return out;
}

/** Doubles damage dice for a critical hit and adds crit-only extras (Brutal Critical, Vicious). */
export function withCrit(c: Composed, extraWeaponDice = 0, flatOnCrit: { label: string; value: number }[] = []): Composed {
  const out: Composed = { ...c, terms: critFormula(c.terms, extraWeaponDice), sources: [...c.sources] };
  for (const f of flatOnCrit) pushFlat(out, f.value, f.label);
  return out;
}

export interface ComposedRoll {
  composed: Composed;
  result: RollResult;
  /** True when the dice values were typed in from physical dice. */
  physical: boolean;
}

/** Rolls digitally (secure random) unless dice values from real dice are given. */
export function rollComposed(c: Composed, physical?: number[], rng: Rng = secureRng): ComposedRoll {
  const result = roll(c.terms, physical ? scriptedRng(physical) : rng);
  return { composed: c, result, physical: !!physical };
}

/**
 * Physical damage is usually entered as one total for all the dice on the
 * table. This adds the flat modifiers to that total.
 */
export function physicalDamageTotal(c: Composed, diceTotal: number): number {
  return c.terms.reduce((sum, t) => sum + (t.kind === "flat" ? t.sign * t.value : 0), diceTotal);
}

/** How many d20s the player rolls for this roll (1, or 2 with advantage or disadvantage). */
export function d20Count(c: Composed): number {
  const t = c.terms[0];
  return t && t.kind === "dice" && t.sides === 20 ? t.count : 0;
}

/** Number of dice of each size to roll, for the physical damage prompt: "2d8 + 4d6". */
export function diceToRoll(c: Composed): string {
  const counts = new Map<number, number>();
  for (const t of c.terms) if (t.kind === "dice") counts.set(t.sides, (counts.get(t.sides) ?? 0) + t.count);
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([sides, n]) => `${n}d${sides}`)
    .join(" + ");
}

/** What the sources say the d20 is, before the player's own override. */
export function sourcesMode(base: ComposerBase, choices: ComposerChoices = noChoices): "advantage" | "disadvantage" | "normal" {
  const { force: _ignored, ...rest } = choices;
  return composeD20(base, { ...rest, manual: "none" }).d20Mode ?? "normal";
}
