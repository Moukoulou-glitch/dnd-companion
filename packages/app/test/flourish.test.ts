import { describe, expect, it } from "vitest";
import { flourishAfter } from "../src/flourish";

describe("8h: Blade Flourish after its damage roll", () => {
  it("after the roll: the AC, the second creature, the push (the first die on a crit)", () => {
    const rec = (source: string, detail: string, total: number) => ({ id: "x", at: 0, title: "Rapier damage", kind: "damage" as const, total: 9, crit: false, fumble: false, physical: false, lines: [{ source: "Weapon", detail: "1d8 [4]", total: 4 }, { source, detail, total }], mainType: "piercing" });
    expect(flourishAfter(rec("Defensive Flourish", "1d8 [5]", 5))).toMatchObject({ ac: 5 });
    expect(flourishAfter(rec("Defensive Flourish", "2d8 [3, 6]", 9))!.ac).toBe(3);
    expect(flourishAfter(rec("Slashing Flourish", "1d8 [6]", 6))!.note).toMatch(/takes 6 piercing damage/);
    expect(flourishAfter(rec("Mobile Flourish", "1d8 [2]", 2))!.note).toMatch(/up to 7 ft/);
  });
});
