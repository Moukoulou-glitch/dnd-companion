import type { ActionResult, DerivedSheet, Suggestion } from "@dnd/engine";

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
  return actions.filter((a) => !a.common && a.cost?.resource === resourceId);
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
