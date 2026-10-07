import { describeTerm, type ComposedRoll } from "@dnd/dice";

/** One saved roll, with enough detail to show its full breakdown later. */
export interface RollRecord {
  id: string;
  at: number;
  title: string;
  kind: "d20" | "damage";
  total: number;
  natural?: number;
  crit: boolean;
  fumble: boolean;
  physical: boolean;
  /** One line per term: source, dice faces or value, and its total. */
  lines: { source: string; detail: string; total: number }[];
  /** Damage only: total per damage type. */
  byType?: Record<string, number>;
}

export const MAX_ROLLS = 200;

export function recordOf(title: string, kind: RollRecord["kind"], r: ComposedRoll, physicalTotal?: number): RollRecord {
  const lines = r.result.terms.map((t, i) => ({
    source: r.composed.sources[i] ?? "",
    detail: t.term.kind === "flat" ? "" : describeTerm(t).replace(/^\+/, ""),
    total: t.total,
  }));
  const rec: RollRecord = {
    id: crypto.randomUUID(),
    at: Date.now(),
    title,
    kind,
    total: physicalTotal ?? r.result.total,
    crit: kind === "d20" && r.result.crit,
    fumble: kind === "d20" && r.result.fumble,
    physical: r.physical,
    lines,
  };
  if (kind === "d20" && r.result.natural !== undefined) rec.natural = r.result.natural;
  if (kind === "damage" && physicalTotal === undefined) {
    // Flat modifiers belong to the weapon's damage type; extra dice keep their own type.
    const byType: Record<string, number> = {};
    const weaponType = r.result.terms[0]?.term.label ?? "damage";
    for (const t of r.result.terms) {
      const type = t.term.kind === "dice" ? t.term.label ?? weaponType : weaponType;
      byType[type] = (byType[type] ?? 0) + t.total;
    }
    rec.byType = byType;
  }
  return rec;
}
