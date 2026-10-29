import { describe, expect, it } from "vitest";
import { composeD20, composeDamage, rollComposed, type ComposerBase } from "../src/index.js";

const base = (extra: Partial<ComposerBase> = {}): ComposerBase => ({ total: 0, parts: [{ label: "Strength", value: 3 }], dice: [], advantage: [], disadvantage: [], suggestions: [], ...extra });

describe("dice added by hand", () => {
  it("a bonus die and a penalty die on a d20 roll, beside the flat bonus", () => {
    const c = composeD20(base(), { enabled: [], manual: "none", extra: 1, extraDice: ["+1d4", "-1d6"] });
    const hand = c.terms.filter((_, i) => c.sources[i] === "Added by hand");
    expect(hand).toEqual([
      { kind: "flat", sign: 1, value: 1 },
      expect.objectContaining({ kind: "dice", sign: 1, count: 1, sides: 4 }),
      expect.objectContaining({ kind: "dice", sign: -1, count: 1, sides: 6 }),
    ]);
  });
  it("on damage they take the roll's type; a penalty die keeps the damage at least 1", () => {
    const c = composeDamage("1d8", "slashing", base(), { enabled: [], manual: "none", extra: 0, extraDice: ["+1d6", "-1d4"] }, "Weapon");
    const hand = c.terms.filter((_, i) => c.sources[i] === "Added by hand");
    expect(hand).toEqual([expect.objectContaining({ sign: 1, sides: 6, label: "slashing" }), expect.objectContaining({ sign: -1, sides: 4, label: "slashing" })]);
    expect(c.minTotal).toBe(1);
  });
});

describe("Adama: both d20s added", () => {
  const adama = { label: "Adama", effect: "add both d20s", apply: { flat: 0, dice: [], sumD20: 20 } };
  const b = base({ suggestions: [adama], advantage: ["Help"], critAt: 19, minD20: 10 });
  it("with advantage: two dice, none dropped, nothing changes them; exactly 20 is a natural 20", () => {
    const c = composeD20(b, { enabled: ["Adama"], manual: "none", extra: 0 });
    expect(c.terms[0]).toEqual({ kind: "dice", sign: 1, count: 2, sides: 20, critOnSum: 20 });
    expect(rollComposed(c, [12, 8]).result).toMatchObject({ total: 23, crit: true, fumble: false, natural: 20 });
    expect(rollComposed(c, [19, 18]).result).toMatchObject({ total: 40, crit: false });
    expect(rollComposed(c, [1, 1]).result).toMatchObject({ total: 5, crit: false, fumble: false });
  });
  it("on a normal roll it does nothing", () => {
    const c = composeD20(base({ suggestions: [adama] }), { enabled: ["Adama"], manual: "none", extra: 0 });
    expect(c.terms[0]).toEqual({ kind: "dice", sign: 1, count: 1, sides: 20 });
  });
});
