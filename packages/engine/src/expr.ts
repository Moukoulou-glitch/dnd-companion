import { ABILITY_NAMES, type Ability, type ValueExpr } from "@dnd/schema";

export interface ExprContext {
  pb: number;
  mods: Record<Ability, number>;
  level: number;
  classLevels: Record<string, number>;
  /** Level-table values of the feature being evaluated, already resolved for the character's level. */
  scale?: Record<string, ValueExpr>;
  /** Slot level an effect was cast at (Aid). */
  slotLevel?: number;
  /** Your spellcasting ability's modifier, the best when you have several ("spellmod": Green-Flame Blade's leap). */
  spellMod?: number;
}

export type Term = { kind: "flat"; value: number; label?: string } | { kind: "dice"; dice: string };

/** "2d8", and "2d8kh1": two dice, keep the higher (Mote of Potential on a check: the die rolled twice, keep either). */
const DICE = /^(\d*)d(\d+)(kh\d+)?$/;

/**
 * Evaluates a value expression into terms. Named terms (pb, mod.dex) carry
 * their own label so breakdowns can say "Dexterity modifier +3" instead of
 * hiding it inside a source's number.
 */
export function evalExpr(expr: ValueExpr, ctx: ExprContext): Term[] {
  if (typeof expr === "number") return [{ kind: "flat", value: expr }];

  // Kept whole: "bySlot[3:1d8;5:2d8]", and dice counts with their own sign ("slotLevel-1d8", "2xslotLevel-8d6", "cantrip-1d8").
  const tokens = expr.replace(/\s+/g, "").match(/[+-]?(?:bySlot\[[^\]]*\]|(?:\d+x)?slotLevel[+-]\d+d\d+|cantrip-\d+d\d+|[^+-]+)/g);
  if (!tokens) throw new Error(`Empty expression "${expr}"`);

  return tokens.flatMap((raw): Term[] => {
    const sign = raw.startsWith("-") ? -1 : 1;
    const t = raw.replace(/^[+-]/, "");

    const sc = /^scale\.(.+)$/.exec(t);
    if (sc) {
      const value = ctx.scale?.[sc[1] as string];
      if (value === undefined) throw new Error(`No scaling value "${sc[1]}" for expression "${expr}"`);
      if (typeof value === "string" && value.includes("scale.")) throw new Error(`Scaling values cannot refer to scaling: "${value}"`);
      return evalExpr(value, ctx).map((term) => (term.kind === "flat" ? { ...term, value: sign * term.value } : term));
    }
    return [single(sign, t)];
  });

  function single(sign: number, t: string): Term {
    if (/^\d+$/.test(t)) return { kind: "flat", value: sign * Number(t) };

    // "classLevel.class:sorcerer/2": a number divided, rounded down (half your sorcerer level).
    const div = /^(.+)\/(\d+)$/.exec(t);
    if (div) {
      const inner = single(1, div[1]!);
      if (inner.kind === "dice") throw new Error(`Can't divide dice in "${expr}"`);
      return { kind: "flat", value: sign * Math.floor(inner.value / Number(div[2])), label: `${inner.label ?? div[1]} ÷ ${div[2]}, rounded down` };
    }

    // "5*slotLevel": a whole number times one named term.
    const times = /^(\d+)\*(.+)$/.exec(t);
    if (times) {
      const inner = single(sign, times[2]!);
      if (inner.kind === "dice") throw new Error(`Can't multiply dice in "${expr}"`);
      return { ...inner, value: inner.value * Number(times[1]) };
    }
    // "slotLeveld6": as many d6 as the slot level (Searing Smite upcast); "slotLevel-1d8" one fewer.
    const sd = /^slotLevel(?:([+-])(\d+))?d(\d+)$/.exec(t);
    if (sd) {
      if (ctx.slotLevel === undefined) throw new Error(`"slotLevel" used outside a cast effect in "${expr}"`);
      const n = ctx.slotLevel + (sd[1] === "-" ? -Number(sd[2]) : sd[1] === "+" ? Number(sd[2]) : 0);
      return { kind: "dice", dice: `${sign < 0 ? "-" : ""}${Math.max(1, n)}d${sd[3]}` };
    }
    // "2xslotLevel-8d6": twice the slot level, less 8, of d6 (Arcane Hand's crush: 2d6 at 5th, +2d6 a level).
    const xs = /^(\d+)xslotLevel(?:([+-])(\d+))?d(\d+)$/.exec(t);
    if (xs) {
      if (ctx.slotLevel === undefined) throw new Error(`"slotLevel" used outside a cast effect in "${expr}"`);
      const n = Number(xs[1]) * ctx.slotLevel + (xs[2] === "-" ? -Number(xs[3]) : xs[2] === "+" ? Number(xs[3]) : 0);
      return { kind: "dice", dice: `${sign < 0 ? "-" : ""}${Math.max(1, n)}d${xs[4]}` };
    }
    // "bySlot[3:1d8;5:2d8;7:3d8]": what the slot level reaches, the highest entry at or under it (Spirit Shroud).
    const bs = /^bySlot\[(.+)\]$/.exec(t);
    if (bs) {
      if (ctx.slotLevel === undefined) throw new Error(`"slotLevel" used outside a cast effect in "${expr}"`);
      const rows = bs[1]!.split(";").map((r) => r.split(":")).map(([l, v]) => [Number(l), v!] as const).sort((a, b) => a[0] - b[0]);
      const hit = rows.filter(([l]) => l <= ctx.slotLevel!).at(-1) ?? rows[0]!;
      const inner = single(sign, hit[1]);
      return inner;
    }
    // "cantripd8": a cantrip's dice by character level (1, 2 at 5th, 3 at 11th, 4 at 17th); "cantrip-1d8": one fewer (none below 5th).
    const cd = /^cantrip(?:-(\d+))?d(\d+)$/.exec(t);
    if (cd) {
      const n = 1 + (ctx.level >= 5 ? 1 : 0) + (ctx.level >= 11 ? 1 : 0) + (ctx.level >= 17 ? 1 : 0) - Number(cd[1] ?? 0);
      if (n <= 0) return { kind: "flat", value: 0 };
      return { kind: "dice", dice: `${sign < 0 ? "-" : ""}${n}d${cd[2]}` };
    }
    if (t === "spellmod") return { kind: "flat", value: sign * (ctx.spellMod ?? Math.max(ctx.mods.int, ctx.mods.wis, ctx.mods.cha)), label: "Spellcasting modifier" };
    if (t === "slotLevel") {
      if (ctx.slotLevel === undefined) throw new Error(`"slotLevel" used outside a cast effect in "${expr}"`);
      return { kind: "flat", value: sign * ctx.slotLevel, label: "Slot level" };
    }

    const dice = DICE.exec(t);
    if (dice) {
      // Negative dice (Bane's -1d4) keep their sign in the dice string.
      return { kind: "dice", dice: `${sign < 0 ? "-" : ""}${dice[1] || "1"}d${dice[2]}${dice[3] ?? ""}` };
    }
    if (t === "pb") return { kind: "flat", value: sign * ctx.pb, label: "Proficiency bonus" };
    if (t === "level") return { kind: "flat", value: sign * ctx.level, label: "Character level" };

    const mod = /^mod\.(str|dex|con|int|wis|cha)$/.exec(t);
    if (mod) {
      const ab = mod[1] as Ability;
      return { kind: "flat", value: sign * ctx.mods[ab], label: `${ABILITY_NAMES[ab]} modifier` };
    }

    // "mod1.cha": the modifier, but at least +1 (Aura of Protection).
    const mod1 = /^mod1\.(str|dex|con|int|wis|cha)$/.exec(t);
    if (mod1) {
      const ab = mod1[1] as Ability;
      return { kind: "flat", value: sign * Math.max(1, ctx.mods[ab]), label: `${ABILITY_NAMES[ab]} modifier (at least +1)` };
    }

    const cl = /^classLevel\.(.+)$/.exec(t);
    if (cl) {
      const id = cl[1] as string;
      return { kind: "flat", value: sign * (ctx.classLevels[id] ?? 0), label: "Class level" };
    }

    throw new Error(`Unknown term "${t}" in expression "${expr}"`);
  }
}

/** Evaluates an expression that must be a plain number (resource maximums, AC formulas). */
export function evalFlat(expr: ValueExpr, ctx: ExprContext): number {
  return evalExpr(expr, ctx).reduce((total, term) => {
    if (term.kind === "dice") throw new Error(`Expected a number, got dice in "${String(expr)}"`);
    return total + term.value;
  }, 0);
}
