import type { RollRecord } from "./rolls";

/**
 * What a Blade Flourish does once its damage is rolled (the tick-box on the
 * damage roll): Defensive puts the die on your AC until your next turn starts,
 * Slashing deals the same to another creature, Mobile pushes the target.
 * On a critical hit the flourish's die is rolled twice for damage; the AC,
 * the second creature and the push use the first die only.
 */
export function flourishAfter(r: RollRecord): { ac?: number; note: string } | undefined {
  if (r.kind !== "damage") return undefined;
  const line = r.lines.find((l) => /^(Defensive|Slashing|Mobile) Flourish/.test(l.source));
  if (!line) return undefined;
  const faces = /\[([^\]]+)\]/.exec(line.detail)?.[1]?.match(/\d+/g)?.map(Number) ?? [];
  const die = faces[0] ?? line.total;
  const kind = /^(\w+)/.exec(line.source)![1]!;
  const type = r.mainType ?? "damage";
  if (kind === "Defensive") return { ac: die, note: `Defensive Flourish: +${die} AC until the start of your next turn.` };
  if (kind === "Slashing") return { note: `Slashing Flourish: another creature of your choice within 5 ft of you takes ${die} ${type} damage too.` };
  return { note: `Mobile Flourish: you can push the target up to ${5 + die} ft away; then your reaction can take you up to your walking speed to a space within 5 ft of it.` };
}
