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
}

/** A computed number and every source that contributed to it. */
export interface Breakdown {
  total: number;
  parts: Part[];
}

/** A d20 roll bonus: flat total plus dice, advantage state and suggestions. */
export interface RollBreakdown extends Breakdown {
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
export function formatBonus(r: Pick<RollBreakdown, "total" | "dice">): string {
  return [signed(r.total), ...r.dice.map((d) => `+${d.dice}`)].join(" ");
}

/** Multi-line, human-readable breakdown used in tests and debugging. */
export function explain(b: Breakdown | RollBreakdown): string {
  const lines = b.parts.map((p) => `${signed(p.value).padStart(4)}  ${p.label}`);
  if ("dice" in b) {
    for (const d of b.dice) lines.push(`+${d.dice}  ${d.label}`);
    for (const a of b.advantage) lines.push(` adv  ${a}`);
    for (const a of b.disadvantage) lines.push(` dis  ${a}`);
    for (const s of b.suggestions) lines.push(`  ?   ${s.label} (${s.effect})`);
  }
  lines.push(`= ${b.total}`);
  return lines.join("\n");
}
