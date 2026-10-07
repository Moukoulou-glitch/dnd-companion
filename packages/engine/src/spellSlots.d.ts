import type { Progression } from "@dnd/schema";
export interface CasterClass {
    progression: Progression;
    level: number;
}
export interface SlotResult {
    /** Spell slots by spell level (index 0 = 1st level). */
    slots: number[];
    casterLevel: number;
    pact?: {
        count: number;
        level: number;
    };
}
/**
 * Spell slots for any mix of classes, 2014 rules:
 * - one slot-casting class uses its own table (half casters: full table at
 *   ceil(level / 2) from level 2; third casters: ceil(level / 3) from level 3);
 * - several use the multiclass table with full + floor(half / 2) + floor(third / 3);
 * - Pact Magic is always separate.
 */
export declare function spellSlots(classes: CasterClass[]): SlotResult;
