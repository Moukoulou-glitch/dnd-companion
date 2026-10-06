import type { Progression } from "@dnd/schema";

/** 2014 multiclass spellcaster table: caster level -> slots for spell levels 1..9. */
const FULL: readonly (readonly number[])[] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Warlock Pact Magic: warlock level -> [slot count, slot level]. */
const PACT: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 1],
  [2, 1],
  [2, 2],
  [2, 2],
  [2, 3],
  [2, 3],
  [2, 4],
  [2, 4],
  [2, 5],
  [2, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [4, 5],
  [4, 5],
  [4, 5],
  [4, 5],
];

export interface CasterClass {
  progression: Progression;
  level: number;
}

export interface SlotResult {
  /** Spell slots by spell level (index 0 = 1st level). */
  slots: number[];
  casterLevel: number;
  pact?: { count: number; level: number };
}

/**
 * Spell slots for any mix of classes, 2014 rules:
 * - one slot-casting class uses its own table (half casters: full table at
 *   ceil(level / 2) from level 2; third casters: ceil(level / 3) from level 3);
 * - several use the multiclass table with full + floor(half / 2) + floor(third / 3);
 * - Pact Magic is always separate.
 */
export function spellSlots(classes: CasterClass[]): SlotResult {
  const slotCasters = classes.filter((c) => ["full", "half", "third"].includes(c.progression));
  let casterLevel = 0;

  if (slotCasters.length === 1) {
    const c = slotCasters[0]!;
    if (c.progression === "full") casterLevel = c.level;
    if (c.progression === "half") casterLevel = c.level >= 2 ? Math.ceil(c.level / 2) : 0;
    if (c.progression === "third") casterLevel = c.level >= 3 ? Math.ceil(c.level / 3) : 0;
  } else {
    for (const c of slotCasters) {
      if (c.progression === "full") casterLevel += c.level;
      if (c.progression === "half") casterLevel += Math.floor(c.level / 2);
      if (c.progression === "third") casterLevel += Math.floor(c.level / 3);
    }
  }

  const result: SlotResult = { slots: [...(FULL[Math.min(casterLevel, 20)] ?? [])], casterLevel };

  const warlock = classes.find((c) => c.progression === "pact");
  if (warlock) {
    const [count, level] = PACT[Math.min(warlock.level, 20)] ?? [0, 0];
    if (count > 0) result.pact = { count, level };
  }
  return result;
}
