import type { DerivedSheet, WeaponAttack } from "@dnd/engine";

type Sg = { label: string; endsEffect?: string | undefined };

/** A one-time option (a smite waiting for the next hit) used up on an earlier roll of the same panel. */
export interface UsedUp {
  label: string;
  /** The effect it ended (its instance id). */
  effect: string;
}

/** The options a roll used up: the ticked ones that end their effect (a smite on the hit). */
export function usedUpBy(suggestions: Sg[], enabled: string[]): UsedUp[] {
  return suggestions.filter((s) => s.endsEffect && enabled.includes(s.label)).map((s) => ({ label: s.label, effect: s.endsEffect! }));
}

/** The breakdown without the options already used up, so they can't be ticked (or start ticked) again. */
export function withoutUsedUp<B extends { suggestions: Sg[] }>(b: B, used: UsedUp[]): B {
  if (!used.length) return b;
  return { ...b, suggestions: b.suggestions.filter((s) => !(s.endsEffect && used.some((u) => u.effect === s.endsEffect))) };
}

/**
 * The attack as the sheet has it now: a roll panel keeps working with the
 * latest numbers (a smite used on the first hit of Extra Attack is gone from
 * the second). Falls back to the attack it was opened with.
 */
/**
 * What was added to one attack by hand before its roll (the Battleaxe of Regina Lapsa's d4), put again on the
 * sheet's fresh copy of that attack each time the roll panel draws.
 */
export const attackOverlays = new WeakMap<WeaponAttack, (fresh: WeaponAttack) => WeaponAttack>();

export function liveAttack<A extends WeaponAttack>(sheet: DerivedSheet | undefined, a: A): A {
  if (!sheet) return a;
  const over = attackOverlays.get(a);
  if (over) {
    const plain = liveAttackOf(sheet, a);
    return (plain === a ? a : over(plain)) as A;
  }
  return liveAttackOf(sheet, a);
}

function liveAttackOf<A extends WeaponAttack>(sheet: DerivedSheet, a: A): A {
  const same = (x: WeaponAttack) => x.attackId === a.attackId && x.itemInstanceId === a.itemInstanceId && x.mode === a.mode && !!x.offHand === !!a.offHand && x.name === a.name;
  const found = sheet.attacks.find(same) ?? sheet.companions.flatMap((c) => c.form?.attacks ?? []).find(same);
  return (found as A | undefined) ?? a;
}
