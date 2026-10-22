import { describeTerm, type ComposedRoll } from "@dnd/dice";

/** One saved roll, with enough detail to show its full breakdown later. */
export interface RollRecord {
  id: string;
  at: number;
  title: string;
  kind: "d20" | "damage";
  /** An attack roll (not a check or save): crits and natural 1s mean something here. */
  attack?: boolean;
  /** The spell this roll is for (its content id), and whether it's a later use while it lasts (from the concentration chip). */
  spell?: string;
  again?: boolean;
  /** The dice faces came from the 3D dice thrown on screen. */
  thrown?: boolean;
  /** Options turned on for this roll (Reckless Attack), as their labels. */
  options?: string[];
  total: number;
  natural?: number;
  crit: boolean;
  fumble: boolean;
  physical: boolean;
  /** One line per term: source, dice faces or value, and its total. */
  lines: { source: string; detail: string; total: number }[];
  /** Damage only: total per damage type. */
  byType?: Record<string, number>;
  /** Damage only: parts the target saves against (a poison sting): their total (-1: typed in as one total), the save, and what a success leaves. */
  saves?: { label: string; type?: string; total: number; dc: number; ability: string; half: boolean }[];
  /** Damage only: the first damage type in it (the weapon's or the spell's), kept even when you entered your own dice's total. */
  mainType?: string;
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
  // Dice taken away (Diminution) brought it under the minimum: a line for the difference, so the lines still add up.
  const floorUp = r.result.floored !== undefined ? r.result.total - r.result.terms.reduce((n, t) => n + t.total, 0) : 0;
  if (floorUp > 0) rec.lines.push({ source: `At least ${r.result.floored} damage`, detail: "", total: floorUp });
  if (kind === "d20" && r.result.natural !== undefined) rec.natural = r.result.natural;
  if (kind === "damage") {
    const first = r.result.terms[0]?.term.label;
    if (first) rec.mainType = first;
  }
  if (kind === "damage" && physicalTotal === undefined) {
    // Flat modifiers belong to the weapon's damage type; extra dice keep their own type.
    const byType: Record<string, number> = {};
    const weaponType = r.result.terms[0]?.term.label ?? "damage";
    for (const t of r.result.terms) {
      const type = t.term.kind === "dice" ? t.term.label ?? weaponType : weaponType;
      byType[type] = (byType[type] ?? 0) + t.total;
    }
    if (floorUp > 0) byType[weaponType] = (byType[weaponType] ?? 0) + floorUp;
    rec.byType = byType;
  } else if (kind === "damage") {
    // Typed in as one total from your own dice: by type only when the roll has a single type.
    const types = new Set(r.result.terms.filter((t) => t.term.kind === "dice").map((t) => t.term.label ?? r.result.terms[0]?.term.label ?? "damage"));
    if (types.size === 1) rec.byType = { [[...types][0]!]: rec.total };
  }
  if (kind === "damage" && r.composed.saves?.length) {
    rec.saves = r.composed.saves.map((sv) => {
      const terms = r.result.terms.filter((_, i) => r.composed.sources[i] === sv.source);
      return { label: sv.source, ...(terms[0]?.term.kind === "dice" && terms[0].term.label ? { type: terms[0].term.label } : {}), total: physicalTotal === undefined ? terms.reduce((n, t) => n + t.total, 0) : -1, dc: sv.dc, ability: sv.ability, half: sv.half };
    });
  }
  return rec;
}
