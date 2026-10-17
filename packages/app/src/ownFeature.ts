import type { ActionResult } from "@dnd/engine";

/**
 * The feature a resource belongs to, when spending one of its uses means using
 * that feature (Second Wind, Healing Hands, Form of Dread): its own id, it rolls
 * or heals, and it isn't a pool spent by the point (Lay on Hands). Shared pools
 * (Bardic Inspiration, Psionic Energy, ki) have none: their pips stay a die to spend.
 */
export function ownFeatureOf(actions: ActionResult[], resourceId: string): ActionResult | undefined {
  return actions.find((a) => a.id === resourceId && a.cost?.resource === resourceId && !a.spendAmount && !!(a.heal || a.tempHp || a.roll));
}
