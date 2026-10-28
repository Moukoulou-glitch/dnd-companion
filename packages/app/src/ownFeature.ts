import type { ActionResult, DerivedSheet, SpellResult, Suggestion } from "@dnd/engine";

/**
 * The feature a resource belongs to, when spending one of its uses means using
 * that feature (Second Wind, Healing Hands, Form of Dread): its own id, it rolls
 * or heals, and it isn't a pool spent by the point (Lay on Hands). Shared pools
 * (Bardic Inspiration, Psionic Energy, ki) have none: their pips stay a die to spend.
 */
export function ownFeatureOf(actions: ActionResult[], resourceId: string): ActionResult | undefined {
  return actions.find((a) => a.id === resourceId && a.cost?.resource === resourceId && !a.spendAmount && !!(a.heal || a.tempHp || a.roll));
}

/**
 * Everything that spends a resource (Channel Divinity's options, Fire Rune: invoke, Action Surge), in the
 * sheet's order. Actions anyone can take aren't features; a shared pool's other name counts (Channel Divinity).
 */
export function usesOf(actions: ActionResult[], resourceId: string): ActionResult[] {
  // Also the feature the pool is named after: paid with another pool (Harness Divine Power: its own uses, paid in Channel Divinity),
  // or with no cost because its use is spent only when it works (Draconic Presence: a reroll that has to succeed).
  return actions.filter((a) => !a.common && (a.cost?.resource === resourceId || a.id === resourceId));
}

/**
 * Extra damage a resource pays for when it's ticked on a hit (Fire Rune: invoke's 2d6 fire): the offers on your
 * attacks that spend it, one per kind. Dice-free offers (an advantage) aren't riders.
 */
export function ridersOf(sheet: Pick<DerivedSheet, "attacks"> | undefined, resourceId: string): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const a of sheet?.attacks ?? [])
    for (const s of [...a.attack.suggestions, ...a.damage.bonus.suggestions]) {
      if (s.spends?.resource !== resourceId || !s.apply.dice.length) continue;
      const key = `${s.label}|${s.effect}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  return out;
}

/** Spells a resource casts for free (Mystic Arcanum, Misty Wanderer, Walker in Dreams' three), once they're picked. */
export function freeSpellsOf(sheet: Pick<DerivedSheet, "spells"> | undefined, resourceId: string): SpellResult[] {
  return (sheet?.spells ?? []).filter((sp) => sp.cast.free?.resource === resourceId);
}

/**
 * Offers on any roll that spend a resource when they're ticked (Dark One's Own Luck on checks and saves,
 * Overchannel on spell damage), one per label. Anywhere in the sheet: saves, checks, skills, spells, attacks.
 */
export function rollOptionsOf(sheet: object | undefined, resourceId: string): Suggestion[] {
  const out = new Map<string, Suggestion>();
  const seen = new Set<object>();
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object" || seen.has(x)) return;
    seen.add(x);
    if (Array.isArray(x)) return x.forEach(walk);
    for (const [k, v] of Object.entries(x)) {
      if (k === "suggestions" && Array.isArray(v)) {
        for (const s of v as Suggestion[]) if (s?.spends?.resource === resourceId && !out.has(s.label)) out.set(s.label, s);
      } else walk(v);
    }
  };
  walk(sheet);
  return [...out.values()];
}
