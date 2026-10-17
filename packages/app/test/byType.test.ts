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
