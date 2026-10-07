import { type Ability, type ValueExpr } from "@dnd/schema";
export interface ExprContext {
    pb: number;
    mods: Record<Ability, number>;
    level: number;
    classLevels: Record<string, number>;
    /** Level-table values of the feature being evaluated, already resolved for the character's level. */
    scale?: Record<string, ValueExpr>;
}
export type Term = {
    kind: "flat";
    value: number;
    label?: string;
} | {
    kind: "dice";
    dice: string;
};
/**
 * Evaluates a value expression into terms. Named terms (pb, mod.dex) carry
 * their own label so breakdowns can say "Dexterity modifier +3" instead of
 * hiding it inside a source's number.
 */
export declare function evalExpr(expr: ValueExpr, ctx: ExprContext): Term[];
/** Evaluates an expression that must be a plain number (resource maximums, AC formulas). */
export declare function evalFlat(expr: ValueExpr, ctx: ExprContext): number;
