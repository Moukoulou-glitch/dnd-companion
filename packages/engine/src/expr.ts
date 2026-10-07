import { ABILITY_NAMES, type Ability, type ValueExpr } from "@dnd/schema";

export interface ExprContext {
  pb: number;
  mods: Record<Ability, number>;
  level: number;
  classLevels: Record<string, number>;
  /** Level-table values of the feature being evaluated, already resolved for the character's level. */
  scale?: Record<string, ValueExpr>;
}

export type Term = { kind: "flat"; value: number; label?: string } | { kind: "dice"; dice: string };

const DICE = /^(\d*)d(\d+)$/;

/**
 * Evaluates a value expression into terms. Named terms (pb, mod.dex) carry
 * their own label so breakdowns can say "Dexterity modifier +3" instead of
 * hiding it inside a source's number.
 */
export function evalExpr(expr: ValueExpr, ctx: ExprContext): Term[] {
  if (typeof expr === "number") return [{ kind: "flat", value: expr }];

  const tokens = expr.replace(/\s+/g, "").match(/[+-]?[^+-]+/g);
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

    const dice = DICE.exec(t);
    if (dice) {
      // Negative dice (Bane's -1d4) keep their sign in the dice string.
      return { kind: "dice", dice: `${sign < 0 ? "-" : ""}${dice[1] || "1"}d${dice[2]}` };
    }
    if (t === "pb") return { kind: "flat", value: sign * ctx.pb, label: "Proficiency bonus" };
    if (t === "level") return { kind: "flat", value: sign * ctx.level, label: "Character level" };

    const mod = /^mod\.(str|dex|con|int|wis|cha)$/.exec(t);
    if (mod) {
      const ab = mod[1] as Ability;
      return { kind: "flat", value: sign * ctx.mods[ab], label: `${ABILITY_NAMES[ab]} modifier` };
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
