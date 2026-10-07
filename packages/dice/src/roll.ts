import { parseFormula, type DiceTerm, type Term } from "./formula.js";

/** Returns a whole number from 1 to `sides`. */
export type Rng = (sides: number) => number;

/** Secure, unbiased die roll (rejection sampling over crypto random values). */
export const secureRng: Rng = (sides) => {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return (buf[0]! % sides) + 1;
  }
};

/** Deterministic generator for tests: Mulberry32 seeded PRNG. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (sides) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * sides) + 1;
  };
}

/** Plays back fixed results, e.g. what the player rolled on real dice. */
export function scriptedRng(results: number[]): Rng {
  const queue = [...results];
  return (sides) => {
    const next = queue.shift();
    if (next === undefined) throw new Error("Not enough dice results entered");
    if (next < 1 || next > sides) throw new Error(`${next} is not a possible result on a d${sides}`);
    return next;
  };
}

export interface DieResult {
  /** What the die showed first. */
  rolled: number;
  /** Second roll, if it was rerolled. */
  rerolled?: number;
  /** Value that counts after rerolls and minimums. */
  value: number;
  /** Dropped by keep-highest / keep-lowest. */
  dropped: boolean;
  /** A minimum raised this die. */
  raised?: boolean;
}

export interface TermResult {
  term: Term;
  dice: DieResult[];
  total: number;
}

export interface RollResult {
  formula: string;
  terms: TermResult[];
  total: number;
  /** For d20 rolls: the natural d20 that counted. */
  natural?: number;
  crit: boolean;
  fumble: boolean;
}

function rollTerm(t: DiceTerm, rng: Rng): TermResult {
  const dice: DieResult[] = [];
  for (let i = 0; i < t.count; i++) {
    const rolled = rng(t.sides);
    const d: DieResult = { rolled, value: rolled, dropped: false };
    if (t.rerollAtOrBelow && rolled <= t.rerollAtOrBelow) {
      d.rerolled = rng(t.sides);
      d.value = d.rerolled;
    }
    if (t.min && d.value < t.min) {
      d.value = t.min;
      d.raised = true;
    }
    dice.push(d);
  }
  if (t.keep) {
    const order = dice
      .map((d, i) => ({ v: d.value, i }))
      .sort((a, b) => (t.keep!.which === "highest" ? b.v - a.v : a.v - b.v) || a.i - b.i);
    const kept = new Set(order.slice(0, t.keep.n).map((o) => o.i));
    dice.forEach((d, i) => (d.dropped = !kept.has(i)));
  }
  const sum = dice.filter((d) => !d.dropped).reduce((s, d) => s + d.value, 0);
  return { term: t, dice, total: t.sign * sum };
}

/** Rolls a parsed or string formula. */
export function roll(formula: string | Term[], rng: Rng = secureRng): RollResult {
  const terms = typeof formula === "string" ? parseFormula(formula) : formula;
  const results = terms.map((t) => (t.kind === "flat" ? { term: t, dice: [], total: t.sign * t.value } : rollTerm(t, rng)));
  const total = results.reduce((s, r) => s + r.total, 0);

  // The natural d20 is the kept die of the first d20 term.
  const d20 = results.find((r) => r.term.kind === "dice" && r.term.sides === 20);
  const natural = d20 ? d20.dice.find((d) => !d.dropped)?.rolled : undefined;
  const critAt = d20 && d20.term.kind === "dice" ? d20.term.critAtOrAbove ?? 20 : 20;
  // Crits and fumbles use the natural roll, before Reliable Talent-style minimums.
  const naturalRoll = d20?.dice.find((d) => !d.dropped);
  const nat = naturalRoll ? naturalRoll.rerolled ?? naturalRoll.rolled : undefined;

  const result: RollResult = {
    formula: typeof formula === "string" ? formula : "",
    terms: results,
    total,
    crit: nat !== undefined && nat >= critAt,
    fumble: nat === 1,
  };
  if (natural !== undefined) result.natural = nat;
  return result;
}

/**
 * Damage dice for a critical hit, 2014 rules: every damage die is rolled
 * twice; flat modifiers are not doubled. `extraDice` adds more weapon dice
 * (Brutal Critical) to the first dice term.
 */
export function critFormula(terms: Term[], extraDice = 0): Term[] {
  let extraUsed = false;
  return terms.map((t) => {
    if (t.kind !== "dice" || t.sign < 0) return t;
    const extra = !extraUsed && extraDice > 0 ? extraDice : 0;
    if (extra) extraUsed = true;
    return { ...t, count: t.count * 2 + extra };
  });
}

/** Total of the dice actually shown, for "2d6 (3, 5)" style display. */
export function describeTerm(r: TermResult): string {
  if (r.term.kind === "flat") return `${r.term.sign < 0 ? "-" : "+"}${r.term.value}`;
  const faces = r.dice
    .map((d) => {
      let s = d.rerolled !== undefined ? `${d.rolled}→${d.rerolled}` : `${d.value}`;
      if (d.raised) s = `${d.rerolled ?? d.rolled}→${d.value}`;
      return d.dropped ? `(${s})` : s;
    })
    .join(", ");
  return `${r.term.sign < 0 ? "-" : "+"}${r.term.count}d${r.term.sides} [${faces}]`;
}
