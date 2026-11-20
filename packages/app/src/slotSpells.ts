import type { SpellResult } from "@dnd/engine";
import { spellMatches } from "./spellSearch";

type SlotSpell = Pick<SpellResult, "level" | "name" | "school" | "concentration" | "higherLevels" | "text"> & {
  ritual?: boolean;
  damage?: { byLevel: Record<number, string> };
  heal?: { byLevel: Record<number, string> };
};

/** Whether casting it with a higher slot does more ("At Higher Levels"). */
export function gainsFromUpcast(sp: SlotSpell, slot: number): boolean {
  if (slot <= sp.level) return false;
  if (sp.higherLevels?.length) return true;
  if (sp.text?.some((t) => /at higher levels|using a spell slot of \d+\w* level or higher/i.test(t))) return true;
  const grows = (by?: Record<number, string>) => !!by && by[slot] !== undefined && by[slot] !== by[sp.level];
  return grows(sp.damage?.byLevel) || grows(sp.heal?.byLevel);
}

/**
 * The spells for a slot, in groups: the slot's own level first, then each
 * lower level from 1st upward; alphabetical within a level; filtered by the search.
 */
export function slotGroups<T extends SlotSpell>(spells: T[], slot: number, query = ""): { level: number; spells: T[] }[] {
  const hits = spells.filter((s) => spellMatches(query, { ...s, ritual: !!s.ritual }));
  const levels = [slot, ...Array.from({ length: slot - 1 }, (_, i) => i + 1)];
  return levels
    .map((level) => ({ level, spells: hits.filter((s) => s.level === level).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.spells.length > 0);
}
