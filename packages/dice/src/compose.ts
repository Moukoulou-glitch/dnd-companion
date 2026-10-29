import { parseFormula, type Term } from "./formula.js";
import { critFormula, roll, scriptedRng, secureRng, type DieResult, type Rng, type RollResult } from "./roll.js";

/**
 * The roll composer's inputs, shaped like the engine's RollBreakdown so the
 * app can pass breakdowns straight in (structural, no engine dependency).
 */
export interface ComposerBase {
  total: number;
  parts: { label: string; value: number }[];
  dice: { label: string; dice: string; damageType?: string; save?: { dc: number; ability: string; half: boolean } }[];
  advantage: string[];
  disadvantage: string[];
  suggestions: {
    label: string;
    effect: string;
    reason?: string;
    /** critAt: a critical hit on this or more while ticked (Hexblade's Curse: 19, against the cursed target). */
    apply: { flat: number; dice: string[]; damageType?: string; mode?: "advantage" | "disadvantage"; weaponDice?: string; critAt?: number; rerollAtOrBelow?: number; minD20?: number; maximize?: boolean; tripleAdvantage?: string };
    /** Ticking it spends this (a superiority die). */
    spends?: { resource: string; amount: number };
    /** One of a group per roll. */
    group?: string;
    /** Only with the weapon in one hand, or in two (Dueling, Great Weapon Fighting). */
    hands?: "one" | "two";
    /** Starts ticked. */
    preset?: "always" | "reaction";
    /** Ticking it uses up this effect (a smite). */
    endsEffect?: string;
    /** Only when the roll has dice of these damage types (Destructive Wrath: lightning or thunder); a maximum then maxes only those dice. */
    forTypes?: string[];
  }[];
  /** Reminders for some damage types only (Thunderbolt Strike: lightning), shown when the roll has them. */
  typedNotes?: { text: string; types: string[] }[];
  critAt?: number;
  minD20?: number;
  /** A total below this counts as this (Indomitable Might: the Strength score). */
  minTotal?: { value: number; label: string };
  /** With advantage, three d20s keep the highest (Elven Accuracy). */
  tripleAdvantage?: string;
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
  /** Damage parts the target saves against (by their source label): a poison sting's DC 11 Constitution save, half on a success. */
  saves?: { source: string; dc: number; ability: string; half: boolean }[];
  /** The total can't go below this (dice taken away, Diminution's -1d4: at least 1 damage; Indomitable Might). */
  minTotal?: number;
  /** Why, when it isn't a damage floor (Indomitable Might). */
  minTotalLabel?: string;
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

  // Elven Accuracy: on the attack itself, or through a ticked option that swaps Strength out (Shillelagh, Hex Warrior).
  const tripleFrom = base.tripleAdvantage ?? on.find((s) => s.apply.tripleAdvantage)?.apply.tripleAdvantage;
  const triple = mode === "advantage" && !!tripleFrom;
  const d20: Term = { kind: "dice", sign: 1, count: mode === "normal" ? 1 : triple ? 3 : 2, sides: 20 };
  if (mode !== "normal") d20.keep = { which: mode === "advantage" ? "highest" : "lowest", n: 1 };
  const critAt = Math.min(base.critAt ?? 20, ...on.map((s) => s.apply.critAt ?? 20));
  if (critAt < 20) d20.critAtOrAbove = critAt;
  // Reliable Talent always; Stroke of Luck (treat the d20 as a 20) when ticked.
  const minD20 = Math.max(base.minD20 ?? 0, ...on.map((s) => s.apply.minD20 ?? 0));
  if (minD20 > 0) d20.min = minD20;
  // Halfling Lucky: a d20 showing this or lower is rolled again once, and the new roll counts.
  const reroll = Math.max(0, ...on.map((s) => s.apply.rerollAtOrBelow ?? 0));
  if (reroll > 0) d20.rerollAtOrBelow = reroll;
  out.terms.push(d20);
  out.sources.push(mode === "normal" ? "d20" : triple ? `d20, advantage (${tripleFrom}: three dice)` : `d20, ${mode}`);

  for (const p of base.parts) pushFlat(out, p.value, p.label);
  for (const d of base.dice) pushDice(out, d.dice, d.label);
  for (const s of on) {
    pushFlat(out, s.apply.flat, s.label);
    for (const d of s.apply.dice) pushDice(out, d, s.label);
  }
  pushFlat(out, choices.extra, "Added by hand");
  if (base.minTotal) {
    out.minTotal = base.minTotal.value;
    out.minTotalLabel = base.minTotal.label;
  }
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
  for (const d of base.dice) {
    pushDice(out, d.dice, d.label, d.damageType ?? damageType);
    if (d.save) (out.saves ??= []).push({ source: d.label, ...d.save });
  }
  const on = base.suggestions.filter((x) => choices.enabled.includes(x.label));
  for (const s of on.filter((x) => !x.forTypes)) {
    pushFlat(out, s.apply.flat, s.label);
    for (const d of s.apply.dice) pushDice(out, d, s.label, s.apply.damageType ?? damageType);
  }
  // Options for some damage types only: when the roll has dice of one of them (after Transmuted Spell or a picked type).
  const present = damageTypesIn(out, damageType);
  const typed = on.filter((x) => x.forTypes && x.forTypes.some((t) => present.has(t)));
  for (const s of typed) {
    pushFlat(out, s.apply.flat, s.label);
    for (const d of s.apply.dice) pushDice(out, d, s.label, s.apply.damageType ?? damageType);
  }
  pushFlat(out, choices.extra, "Added by hand");
  // Dice taken away (Potion of Diminution: 1d4 less): the damage stays at least 1.
  if (out.terms.some((t) => t.kind === "dice" && t.sign < 0)) out.minTotal = 1;
  // Great Weapon Fighting: each damage die of the attack showing this or lower is rolled once more, and the new roll counts.
  const reroll = Math.max(0, ...base.suggestions.filter((x) => choices.enabled.includes(x.label)).map((x) => x.apply.rerollAtOrBelow ?? 0));
  if (reroll > 0) out.terms = out.terms.map((t) => (t.kind === "dice" && t.sign > 0 ? { ...t, rerollAtOrBelow: Math.max(t.rerollAtOrBelow ?? 0, reroll) } : t));
  // Overchannel: every damage die deals its maximum; Destructive Wrath: every lightning and thunder die.
  const maxAll = on.some((x) => x.apply.maximize && !x.forTypes);
  const maxTypes = new Set(typed.filter((x) => x.apply.maximize).flatMap((x) => x.forTypes!));
  if (maxAll || maxTypes.size)
    out.terms = out.terms.map((t) => (t.kind === "dice" && t.sign > 0 && (maxAll || (!!t.label && maxTypes.has(t.label.toLowerCase()))) ? { ...t, min: t.sides } : t));
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

/** A positive die term that deals its maximum (Overchannel, Destructive Wrath): nothing to roll. */
export function isMaxed(t: Term): boolean {
  return t.kind === "dice" && t.sign > 0 && (t.min ?? 0) >= t.sides;
}

/** The damage types a roll's dice have (their labels), and the roll's own type. */
export function damageTypesIn(c: Composed, damageType?: string): Set<string> {
  const out = new Set<string>();
  if (damageType) out.add(damageType.toLowerCase());
  for (const t of c.terms) if (t.kind === "dice" && t.label) out.add(t.label.toLowerCase());
  return out;
}

/** Doubles damage dice for a critical hit and adds crit-only extras (Brutal Critical, Vicious). */
export function withCrit(c: Composed, extraWeaponDice = 0, flatOnCrit: { label: string; value: number }[] = []): Composed {
  const out: Composed = { ...c, terms: critFormula(c.terms, extraWeaponDice), sources: [...c.sources] };
  for (const f of flatOnCrit) pushFlat(out, f.value, f.label);
  return out;
}

/**
 * One die of a roll rolled again, and the new face counts (Piercer). Its
 * minimum still applies (Elemental Adept); the totals follow. `term` and `die`
 * index the result's terms and that term's dice.
 */
export function rerollDie(r: ComposedRoll, term: number, die: number, face: number): ComposedRoll {
  const terms = r.result.terms.map((t, ti) => {
    if (ti !== term || t.term.kind !== "dice") return t;
    const tt = t.term;
    const dice = t.dice.map((d, di) => {
      if (di !== die) return d;
      const before = d.rerolled ?? d.rolled;
      const out: DieResult = { rolled: before, rerolled: face, value: face, dropped: d.dropped };
      if (tt.min && face < tt.min) {
        out.value = tt.min;
        out.raised = true;
      }
      return out;
    });
    return { ...t, dice, total: tt.sign * dice.filter((d) => !d.dropped).reduce((s, d) => s + d.value, 0) };
  });
  let total = terms.reduce((s, t) => s + t.total, 0);
  const result: RollResult = { ...r.result, terms, total };
  delete result.floored;
  if (r.composed.minTotal !== undefined && total < r.composed.minTotal) {
    result.total = total = r.composed.minTotal;
    result.floored = r.composed.minTotal;
  }
  return { ...r, result };
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
  if (c.minTotal !== undefined && result.total < c.minTotal) {
    result.total = c.minTotal;
    result.floored = c.minTotal;
  }
  return { composed: c, result, physical: !!physical };
}

/**
 * Physical damage is usually entered as one total for all the dice on the
 * table. This adds the flat modifiers to that total.
 */
export function physicalDamageTotal(c: Composed, diceTotal: number): number {
  // Dice at their maximum (Destructive Wrath's thunder dice) aren't rolled: their maximum is added here.
  const fixed = c.terms.reduce((sum, t) => sum + (isMaxed(t) && t.kind === "dice" ? t.count * t.sides : 0), 0);
  const total = c.terms.reduce((sum, t) => sum + (t.kind === "flat" ? t.sign * t.value : 0), diceTotal + fixed);
  return c.minTotal !== undefined ? Math.max(c.minTotal, total) : total;
}

/** How many d20s the player rolls for this roll (1, or 2 with advantage or disadvantage). */
export function d20Count(c: Composed): number {
  const t = c.terms[0];
  return t && t.kind === "dice" && t.sides === 20 ? t.count : 0;
}

/** Halfling Lucky: a d20 at or below this is rolled again (0 when nothing rerolls). */
export function d20Reroll(c: Composed): number {
  const t = c.terms[0];
  return t && t.kind === "dice" && t.sides === 20 ? t.rerollAtOrBelow ?? 0 : 0;
}

/** Number of dice of each size to roll, for the physical damage prompt: "2d8 + 4d6". */
export function diceToRoll(c: Composed): string {
  const counts = new Map<number, number>();
  const minus = new Map<number, number>();
  for (const t of c.terms) if (t.kind === "dice" && !isMaxed(t)) (t.sign < 0 ? minus : counts).set(t.sides, ((t.sign < 0 ? minus : counts).get(t.sides) ?? 0) + t.count);
  const list = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[0] - a[0]).map(([sides, n]) => `${n}d${sides}`);
  // Dice taken away (Diminution): "1d8 − 1d4", the total typed with the small die subtracted.
  return [list(counts).join(" + "), ...list(minus).map((d) => `− ${d}`)].filter(Boolean).join(" ");
}

/** What the sources say the d20 is, before the player's own override. */
export function sourcesMode(base: ComposerBase, choices: ComposerChoices = noChoices): "advantage" | "disadvantage" | "normal" {
  const { force: _ignored, ...rest } = choices;
  return composeD20(base, { ...rest, manual: "none" }).d20Mode ?? "normal";
}
