import { withCrit, type Composed } from "@dnd/dice";
import type { WeaponAttack } from "@dnd/engine";
import type { RollRecord } from "./rolls";

/** The looks of a weapon's natural 20 (Sword of Sharpness, Vicious, Life Stealing, Mace of Smiting); "edge" for any other. */
export type TwentyMotif = "sharp" | "vicious" | "drain" | "smite" | "edge" | "tide";

/** Whether a weapon does something more when the d20 shows 20, and which look that has. */
export function twentyMotif(attack: Pick<WeaponAttack, "name" | "damage">): TwentyMotif | undefined {
  const d = attack.damage;
  // Only what a 20 does (not what any critical hit does: Wave's necrotic).
  if (!d.onCrit.length && !d.critRiders?.some((r) => !r.anyCrit)) return undefined;
  const names = [attack.name, ...d.onCrit.map((p) => p.label), ...(d.critRiders ?? []).map((r) => r.label)].join(" ");
  if (/sharpness|severing/i.test(names)) return "sharp";
  if (/life stealing|draining/i.test(names) || d.onCrit.some((p) => p.damageType === "necrotic")) return "drain";
  if (/smiting/i.test(names)) return "smite";
  if (/vicious|cruel/i.test(names)) return "vicious";
  return "edge";
}

/**
 * A damage roll on a hit or a critical hit. Built from the hit's roll every
 * time (never from an earlier critical one), so switching between hit and
 * critical hit can't add anything twice.
 *
 * On a critical hit: every damage die twice, the extra weapon dice (Brutal
 * Critical, Savage Attacks) on the weapon's own dice, and, when the d20 showed
 * 20, the flat damage a 20 adds (Vicious +7), kept apart from the dice so it's
 * never doubled.
 */
export function damageFor(hit: Composed, attack: Pick<WeaponAttack, "damage">, crit: boolean, twenty = false, targetMaxHp = 0): Composed {
  if (!crit) return hit;
  const extra = attack.damage.critExtraDice.reduce((n, p) => n + p.value, 0);
  // The flat damage "when you roll a 20" (Vicious, Sharpness): only when the d20 showed 20, not on a Champion's 19.
  // Any critical hit: half the target's hit point maximum, when it's entered (Wave: necrotic).
  const half = targetMaxHp > 0 ? (attack.damage.critRiders ?? []).filter((r) => r.halfMax).map((r) => ({ label: `${r.label} (half its HP maximum)`, value: Math.floor(targetMaxHp / 2), damageType: r.halfMax! })) : [];
  return withCrit(hit, extra, [...(twenty ? attack.damage.onCrit : []), ...half]);
}

/** The words on a weapon's 20: its name and what the 20 added ("Sword of Sharpness · +14", "Sword of Life Stealing · +10 necrotic"). */
export function twentyLabel(attack: Pick<WeaponAttack, "name" | "damage">, _rec?: RollRecord): string {
  const d = attack.damage;
  const name = (d.onCrit[0]?.label ?? d.critRiders?.[0]?.label ?? attack.name).replace(/\s*\(a 20\)$/, "");
  const adds = d.onCrit.map((p) => `+${p.value}${p.damageType ? ` ${p.damageType}` : ""}`).join(" ");
  return adds ? `${name} · ${adds}` : name;
}
