import { withCrit, type Composed } from "@dnd/dice";
import type { WeaponAttack } from "@dnd/engine";

/**
 * A damage roll on a hit or a critical hit. Built from the hit's roll every
 * time (never from an earlier critical one), so switching between hit and
 * critical hit can't add anything twice.
 *
 * On a critical hit: every damage die twice, the extra weapon dice (Brutal
 * Critical, Savage Attacks) on the weapon's own dice, and the flat damage that
 * only a critical hit adds (Vicious +7: any critical hit at this table), kept
 * apart from the dice so it's never doubled.
 */
export function damageFor(hit: Composed, attack: Pick<WeaponAttack, "damage">, crit: boolean): Composed {
  if (!crit) return hit;
  const extra = attack.damage.critExtraDice.reduce((n, p) => n + p.value, 0);
  return withCrit(hit, extra, attack.damage.onCrit);
}
