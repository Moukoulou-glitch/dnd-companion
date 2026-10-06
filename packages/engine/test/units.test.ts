import { describe, expect, it } from "vitest";
import { evalExpr, evalFlat, type ExprContext } from "../src/expr.js";
import { selectorMatches } from "../src/derive.js";
import { spellSlots } from "../src/spellSlots.js";

const ctx: ExprContext = {
  pb: 3,
  mods: { str: 4, dex: 2, con: 3, int: -1, wis: 0, cha: 1 },
  level: 7,
  classLevels: { "class:barbarian": 7 },
};

describe("value expressions", () => {
  it("evaluates numbers, pb, modifiers and levels", () => {
    expect(evalFlat("13 + mod.dex", ctx)).toBe(15);
    expect(evalFlat("pb", ctx)).toBe(3);
    expect(evalFlat("10 + mod.dex + mod.con", ctx)).toBe(15);
    expect(evalFlat("classLevel.class:barbarian - 2", ctx)).toBe(5);
    expect(evalFlat("level", ctx)).toBe(7);
  });

  it("keeps dice separate from flat values", () => {
    expect(evalExpr("1d4", ctx)).toEqual([{ kind: "dice", dice: "1d4" }]);
    expect(evalExpr("2d6 + 3", ctx)).toEqual([
      { kind: "dice", dice: "2d6" },
      { kind: "flat", value: 3 },
    ]);
  });

  it("reads level-table values through scale.<name>", () => {
    const scaled: ExprContext = { ...ctx, scale: { dice: "4d6", damage: 3 } };
    expect(evalExpr("scale.dice", scaled)).toEqual([{ kind: "dice", dice: "4d6" }]);
    expect(evalFlat("scale.damage + 1", scaled)).toBe(4);
    expect(() => evalFlat("scale.missing", scaled)).toThrow(/No scaling value/);
  });

  it("rejects unknown terms instead of guessing", () => {
    expect(() => evalFlat("mod.luck", ctx)).toThrow(/Unknown term/);
    expect(() => evalFlat("1d4", ctx)).toThrow(/Expected a number/);
  });
});

describe("selectors", () => {
  it("wildcards match everything below them", () => {
    expect(selectorMatches("roll.attack.*", "roll.attack.weapon.ranged")).toBe(true);
    expect(selectorMatches("roll.attack.weapon.ranged", "roll.attack.weapon.melee")).toBe(false);
    expect(selectorMatches("roll.check.*", "roll.check.dex")).toBe(true);
    expect(selectorMatches("roll.save.*", "roll.check.dex")).toBe(false);
  });
});

describe("spell slots (2014)", () => {
  it("single-class full and half casters use their own tables", () => {
    expect(spellSlots([{ progression: "full", level: 4 }]).slots).toEqual([4, 3]);
    expect(spellSlots([{ progression: "half", level: 1 }]).slots).toEqual([]);
    expect(spellSlots([{ progression: "half", level: 4 }]).slots).toEqual([3]);
    expect(spellSlots([{ progression: "half", level: 5 }]).slots).toEqual([4, 2]);
    expect(spellSlots([{ progression: "third", level: 7 }]).slots).toEqual([4, 2]);
  });

  it("multiclass rounds half casters down and adds levels", () => {
    // Paladin 3 + Sorcerer 3 = caster level 1 + 3 = 4
    const r = spellSlots([
      { progression: "half", level: 3 },
      { progression: "full", level: 3 },
    ]);
    expect(r.casterLevel).toBe(4);
    expect(r.slots).toEqual([4, 3]);
  });

  it("Pact Magic stays separate", () => {
    const r = spellSlots([
      { progression: "none", level: 8 },
      { progression: "pact", level: 1 },
    ]);
    expect(r.slots).toEqual([]);
    expect(r.pact).toEqual({ count: 1, level: 1 });
  });
});
