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

describe("Adama: 2d20 with no modifiers", () => {
  const adama = { label: "Adama", effect: "add both d20s", apply: { flat: 2, dice: ["1d4"], sumD20: 20 } };
  const on = { enabled: ["Adama"], manual: "none" as const, extra: 1, extraDice: ["+1d6"] };
  it("with advantage: two dice, none dropped, nothing else added (modifiers, options, dice by hand)", () => {
    const c = composeD20(base({ suggestions: [adama], advantage: ["Help"], dice: [{ label: "Bless", dice: "1d4" }], minD20: 10 }), on);
    expect(c.terms).toEqual([{ kind: "dice", sign: 1, count: 2, sides: 20, critOnSum: 20 }]);
    expect(rollComposed(c, [15, 10]).result).toMatchObject({ total: 25, crit: false, fumble: false, natural: 25 });
    expect(rollComposed(c, [1, 1]).result).toMatchObject({ total: 2, crit: false, fumble: false });
  });
  it("a 20 on either die, or a total of 20, counts as a 20", () => {
    const c = composeD20(base({ suggestions: [adama], disadvantage: ["Prone"] }), on);
    expect(rollComposed(c, [20, 15]).result).toMatchObject({ total: 35, crit: true, natural: 20 });
    expect(rollComposed(c, [3, 20]).result).toMatchObject({ total: 23, crit: true, natural: 20 });
    expect(rollComposed(c, [12, 8]).result).toMatchObject({ total: 20, crit: true, natural: 20 });
    expect(rollComposed(c, [12, 7]).result).toMatchObject({ total: 19, crit: false });
  });
  it("with Improved Critical (19–20): a die or the total on 19 or 20 counts, a higher total doesn't", () => {
    const c = composeD20(base({ suggestions: [adama], advantage: ["Help"], critAt: 19 }), on);
    expect(c.terms[0]).toMatchObject({ critAtOrAbove: 19, critOnSum: 20 });
    expect(rollComposed(c, [19, 4]).result).toMatchObject({ total: 23, crit: true, natural: 23 });
    expect(rollComposed(c, [12, 7]).result).toMatchObject({ total: 19, crit: true });
    expect(rollComposed(c, [12, 9]).result).toMatchObject({ total: 21, crit: false });
  });
  it("Elven Accuracy's third die isn't rolled with it", () => {
    const c = composeD20(base({ suggestions: [adama], advantage: ["Help"], tripleAdvantage: "Elven Accuracy" }), on);
    expect(c.terms[0]).toMatchObject({ count: 2, sides: 20 });
  });
  it("on a normal roll it does nothing", () => {
    const c = composeD20(base({ suggestions: [adama] }), on);
    expect(c.terms[0]).toEqual({ kind: "dice", sign: 1, count: 1, sides: 20 });
    expect(c.terms.length).toBeGreaterThan(1);
  });
});
