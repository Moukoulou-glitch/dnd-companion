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
  apply: { flat: number; dice: string[]; damageType?: string; mode?: "advantage" | "disadvantage" };
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
  /** Sources that make this roll fail automatically (Paralyzed on Dexterity saves). */
  autoFail?: string[];
  dice: DicePart[];
  advantage: string[];
  disadvantage: string[];
  suggestions: Suggestion[];
}

export function sum(parts: Part[]): Breakdown {
  return { total: parts.reduce((t, p) => t + p.value, 0), parts };
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** "+7" or "+7 +1d4": the bonus as a player would read it. */
/** "1d4" → "+1d4", "-1d4" stays "-1d4". */
export function signedDice(dice: string): string {
  return dice.startsWith("-") ? dice : `+${dice}`;
}

export function formatBonus(r: Pick<RollBreakdown, "total" | "dice">): string {
  return [signed(r.total), ...r.dice.map((d) => signedDice(d.dice))].join(" ");
}

/** Multi-line, human-readable breakdown used in tests and debugging. */
export function explain(b: Breakdown | RollBreakdown): string {
  const lines = b.parts.map((p) => `${signed(p.value).padStart(4)}  ${p.label}`);
  if ("dice" in b) {
    for (const d of b.dice) lines.push(`${signedDice(d.dice)}  ${d.label}`);
    for (const a of b.advantage) lines.push(` adv  ${a}`);
    for (const a of b.disadvantage) lines.push(` dis  ${a}`);
    for (const s of b.suggestions) lines.push(`  ?   ${s.label} (${s.effect})`);
  }
  lines.push(`= ${b.total}`);
  return lines.join("\n");
}
