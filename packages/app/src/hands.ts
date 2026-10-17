import type { ComposerBase } from "@dnd/dice";
import type { WeaponAttack } from "@dnd/engine";

/**
 * One hand or two on a weapon attack. A two-handed weapon is always two, a
 * versatile one is the player's choice (its bigger die with two hands: a
 * longsword's d10), anything else is one. Options that need one or the other
 * (Dueling, Great Weapon Fighting) are offered only when they apply.
 */
export type Hands = "one" | "two";

const KEY = "dnd-hands:";
const memory = new Map<string, Hands>();

export const isVersatile = (a: Pick<WeaponAttack, "damage">): boolean => !!a.damage.versatileDice;

/** How the weapon is held for this attack. */
export function handsOf(a: Pick<WeaponAttack, "damage" | "properties">, chosen: Hands): Hands {
  if (a.properties.includes("two-handed")) return "two";
  return isVersatile(a) ? chosen : "one";
}

/** The weapon dice for how it's held. */
export function weaponDiceFor(a: Pick<WeaponAttack, "damage" | "properties">, chosen: Hands): string {
  return handsOf(a, chosen) === "two" && a.damage.versatileDice ? a.damage.versatileDice : a.damage.dice;
}

/** Only the options that fit how the weapon is held. */
export function forHands<T extends Pick<ComposerBase, "suggestions">>(base: T, hands: Hands): T {
  return { ...base, suggestions: base.suggestions.filter((s) => !s.hands || s.hands === hands) };
}

/**
 * The first choice for a versatile weapon: the last one made with it on this
 * device; else two hands when you have an option that needs two (Great Weapon
 * Fighting) and none that needs one (Dueling); else one hand.
 */
export function defaultHands(attackId: string, damageBonus: Pick<ComposerBase, "suggestions">): Hands {
  const remembered = memory.get(attackId) ?? readStored(attackId);
  if (remembered) return remembered;
  const two = damageBonus.suggestions.some((s) => s.hands === "two");
  const one = damageBonus.suggestions.some((s) => s.hands === "one");
  return two && !one ? "two" : "one";
}

export function rememberHands(attackId: string, hands: Hands): void {
  memory.set(attackId, hands);
  try {
    localStorage.setItem(KEY + attackId, hands);
  } catch {
    // this visit only
  }
}

function readStored(attackId: string): Hands | undefined {
  try {
    const v = localStorage.getItem(KEY + attackId);
    return v === "one" || v === "two" ? v : undefined;
  } catch {
    return undefined;
  }
}
