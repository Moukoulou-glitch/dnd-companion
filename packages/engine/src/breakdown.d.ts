/** One line of a breakdown: "Dexterity modifier +3". */
export interface Part {
    label: string;
    value: number;
}
/** Dice added to a roll, e.g. Bless +1d4. */
export interface DicePart {
    label: string;
    dice: string;
    /** For damage dice of their own type, e.g. Flame Tongue's fire. */
    damageType?: string;
}
/** A modifier the engine offers as a toggle instead of applying it. */
export interface Suggestion {
    label: string;
    /** What it does, e.g. "+1d4", "advantage", "-5". */
    effect: string;
    /** Why it is only suggested, e.g. "target is within 5 ft". */
    reason?: string;
    /** What the roll composer applies when the player turns it on. */
    apply: {
        flat: number;
        dice: string[];
        damageType?: string;
        mode?: "advantage" | "disadvantage";
    };
}
/** A computed number and every source that contributed to it. */
export interface Breakdown {
    total: number;
    parts: Part[];
}
/** A d20 roll bonus: flat total plus dice, advantage state and suggestions. */
export interface RollBreakdown extends Breakdown {
    /** Critical hit on this natural d20 or higher (attacks; default 20). */
    critAt?: number;
    /** Any d20 below this counts as this (Reliable Talent). */
    minD20?: number;
    dice: DicePart[];
    advantage: string[];
    disadvantage: string[];
    suggestions: Suggestion[];
}
export declare function sum(parts: Part[]): Breakdown;
export declare function signed(n: number): string;
/** "+7" or "+7 +1d4": the bonus as a player would read it. */
export declare function formatBonus(r: Pick<RollBreakdown, "total" | "dice">): string;
/** Multi-line, human-readable breakdown used in tests and debugging. */
export declare function explain(b: Breakdown | RollBreakdown): string;
