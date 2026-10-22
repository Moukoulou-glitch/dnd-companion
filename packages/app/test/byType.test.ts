import { describe, expect, it } from "vitest";
import { composeDamage, rollComposed, scriptedRng } from "@dnd/dice";
import { recordOf } from "../src/rolls";

if (!(globalThis as any).crypto?.randomUUID) (globalThis as any).crypto = { randomUUID: () => "id" };
const base = (extra: { label: string; dice: string; damageType?: string }[] = []) => ({ total: 4, parts: [{ label: "Dexterity modifier", value: 4 }], dice: extra, advantage: [], disadvantage: [], suggestions: [] });

describe("8a: damage totals by type on every damage roll", () => {
  it("one type (a dagger with Sneak Attack): all of it piercing", () => {
    const c = composeDamage("1d4", "piercing", base([{ label: "Sneak Attack", dice: "4d6" }]));
    const rec = recordOf("Dagger damage", "damage", rollComposed(c, undefined, scriptedRng([3, 4, 6, 5, 2])));
    expect(rec.byType).toEqual({ piercing: 24 });
  });
  it("several types: each with its own total, modifiers with the weapon's", () => {
    const c = composeDamage("1d8", "slashing", base([{ label: "Hex", dice: "1d6", damageType: "necrotic" }]));
    const rec = recordOf("Longsword damage", "damage", rollComposed(c, undefined, scriptedRng([5, 2])));
    expect(rec.byType).toEqual({ slashing: 9, necrotic: 2 });
  });
  it("a single total typed in from your own dice keeps its one type", () => {
    const c = composeDamage("2d6", "bludgeoning", base());
    const rec = recordOf("Maul damage", "damage", rollComposed(c, [3, 3]), 10);
    expect(rec.byType).toEqual({ bludgeoning: 10 });
  });
  it("typed in with several types: no split is guessed", () => {
    const c = composeDamage("1d8", "slashing", base([{ label: "Hex", dice: "1d6", damageType: "necrotic" }]));
    expect(recordOf("x", "damage", rollComposed(c, [4, 4]), 12).byType).toBeUndefined();
  });
});

describe("8d: a part the target saves against", () => {
  const sting = { total: 3, parts: [{ label: "Bonus", value: 3 }], dice: [{ label: "Sting: poison (DC 11 Constitution save)", dice: "3d6", damageType: "poison", save: { dc: 11, ability: "con", half: true } }], advantage: [], disadvantage: [], suggestions: [] };
  it("rolled with the hit, by type, with what a success leaves", () => {
    const c = composeDamage("1d4", "piercing", sting);
    const rec = recordOf("Sting damage", "damage", rollComposed(c, undefined, scriptedRng([2, 4, 3, 3])));
    expect(rec.byType).toEqual({ piercing: 5, poison: 10 });
    expect(rec.saves).toEqual([{ label: "Sting: poison (DC 11 Constitution save)", type: "poison", total: 10, dc: 11, ability: "con", half: true }]);
  });
  it("a critical hit doubles its dice too", async () => {
    const { withCrit } = await import("@dnd/dice");
    const c = withCrit(composeDamage("1d4", "piercing", sting));
    expect(c.saves?.length).toBe(1);
    const rec = recordOf("Sting damage", "damage", rollComposed(c, undefined, scriptedRng([1, 1, 1, 1, 1, 1, 1, 1])));
    expect(rec.saves![0]!.total).toBe(6);
  });
});

describe("10c fix: Diminution takes 1d4 off, never below 1", () => {
  it("a negative die is subtracted; the total stays at least 1 with a line for the difference", async () => {
    const { composeDamage, rollComposed } = await import("@dnd/dice");
    const { recordOf } = await import("../src/rolls.js");
    const base = { total: 0, parts: [], dice: [{ label: "Potion of Diminution", dice: "-1d4" }], advantage: [], disadvantage: [], suggestions: [] };
    const c = composeDamage("1d4", "slashing", base as never);
    expect(c.minTotal).toBe(1);
    // Weapon 1, minus 4: floored to 1.
    const rolled = rollComposed(c, [1, 4]);
    expect(rolled.result.total).toBe(1);
    const rec = recordOf("Dagger damage", "damage", rolled);
    expect(rec.lines.map((l) => l.total).reduce((a, b) => a + b, 0)).toBe(1);
    expect(rec.byType).toEqual({ slashing: 1 });
    // Weapon 4, minus 1: 3.
    expect(rollComposed(c, [4, 1]).result.total).toBe(3);
  });
});
