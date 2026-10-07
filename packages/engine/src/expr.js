import { ABILITY_NAMES } from "@dnd/schema";
const DICE = /^(\d*)d(\d+)$/;
/**
 * Evaluates a value expression into terms. Named terms (pb, mod.dex) carry
 * their own label so breakdowns can say "Dexterity modifier +3" instead of
 * hiding it inside a source's number.
 */
export function evalExpr(expr, ctx) {
    if (typeof expr === "number")
        return [{ kind: "flat", value: expr }];
    const tokens = expr.replace(/\s+/g, "").match(/[+-]?[^+-]+/g);
    if (!tokens)
        throw new Error(`Empty expression "${expr}"`);
    return tokens.flatMap((raw) => {
        const sign = raw.startsWith("-") ? -1 : 1;
        const t = raw.replace(/^[+-]/, "");
        const sc = /^scale\.(.+)$/.exec(t);
        if (sc) {
            const value = ctx.scale?.[sc[1]];
            if (value === undefined)
                throw new Error(`No scaling value "${sc[1]}" for expression "${expr}"`);
            if (typeof value === "string" && value.includes("scale."))
                throw new Error(`Scaling values cannot refer to scaling: "${value}"`);
            return evalExpr(value, ctx).map((term) => (term.kind === "flat" ? { ...term, value: sign * term.value } : term));
        }
        return [single(sign, t)];
    });
    function single(sign, t) {
        if (/^\d+$/.test(t))
            return { kind: "flat", value: sign * Number(t) };
        const dice = DICE.exec(t);
        if (dice) {
            if (sign < 0)
                throw new Error(`Negative dice are not supported: "${expr}"`);
            return { kind: "dice", dice: `${dice[1] || "1"}d${dice[2]}` };
        }
        if (t === "pb")
            return { kind: "flat", value: sign * ctx.pb, label: "Proficiency bonus" };
        if (t === "level")
            return { kind: "flat", value: sign * ctx.level, label: "Character level" };
        const mod = /^mod\.(str|dex|con|int|wis|cha)$/.exec(t);
        if (mod) {
            const ab = mod[1];
            return { kind: "flat", value: sign * ctx.mods[ab], label: `${ABILITY_NAMES[ab]} modifier` };
        }
        const cl = /^classLevel\.(.+)$/.exec(t);
        if (cl) {
            const id = cl[1];
            return { kind: "flat", value: sign * (ctx.classLevels[id] ?? 0), label: "Class level" };
        }
        throw new Error(`Unknown term "${t}" in expression "${expr}"`);
    }
}
/** Evaluates an expression that must be a plain number (resource maximums, AC formulas). */
export function evalFlat(expr, ctx) {
    return evalExpr(expr, ctx).reduce((total, term) => {
        if (term.kind === "dice")
            throw new Error(`Expected a number, got dice in "${String(expr)}"`);
        return total + term.value;
    }, 0);
}
