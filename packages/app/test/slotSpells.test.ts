import { describe, expect, it } from "vitest";
import { gainsFromUpcast, slotGroups } from "../src/slotSpells";

const sp = (name: string, level: number, extra: Record<string, unknown> = {}) => ({ name, level, school: "evocation", concentration: false, higherLevels: [] as string[], text: [] as string[], ...extra });

describe("24k: spells for a slot", () => {
  const list = [sp("Sleep", 1), sp("Aid", 2), sp("Bless", 1), sp("Fireball", 3), sp("Cure Wounds", 1)];
  it("groups the slot's level first, then lower levels from 1st up, names in order", () => {
    const g = slotGroups(list, 3);
    expect(g.map((x) => x.level)).toEqual([3, 1, 2]);
    expect(g[1]!.spells.map((s) => s.name)).toEqual(["Bless", "Cure Wounds", "Sleep"]);
  });
  it("searches by name or level", () => {
    expect(slotGroups(list, 3, "cure").flatMap((g) => g.spells.map((s) => s.name))).toEqual(["Cure Wounds"]);
    expect(slotGroups(list, 3, "2nd").map((g) => g.level)).toEqual([2]);
  });
  it("marks spells that do more with a higher slot", () => {
    expect(gainsFromUpcast(sp("Aid", 2, { higherLevels: ["more"] }), 5)).toBe(true);
    expect(gainsFromUpcast(sp("Cure", 1, { heal: { byLevel: { 1: "1d8", 2: "2d8" } } }), 2)).toBe(true);
    expect(gainsFromUpcast(sp("Shield", 1), 3)).toBe(false);
    expect(gainsFromUpcast(sp("Aid", 2, { higherLevels: ["more"] }), 2)).toBe(false);
  });
});
