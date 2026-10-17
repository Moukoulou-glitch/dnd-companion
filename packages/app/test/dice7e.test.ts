import { describe, expect, it } from "vitest";
import { parseFormula, type Composed } from "@dnd/dice";
import { rollThrown, type Thrower } from "../src/dice3d.js";
import { batches, MAX_IN_AIR } from "../src/dice/plan";

const c = (formula: string) => ({ terms: parseFormula(formula), sources: [] }) as unknown as Composed;
const fixed = (...throws: number[][]): Thrower => async () => throws.shift() ?? [];

describe("7e acceptance: throw planning", () => {
  const g = (s: string) => s[0];
  it("keeps order, never more than 12 in the air", () => {
    const items = Array.from({ length: 40 }, (_, i) => `${i < 20 ? "f" : "b"}${i}`);
    const out = batches(items, g);
    expect(out.flat()).toEqual(items);
    expect(Math.max(...out.map((b) => b.length))).toBeLessThanOrEqual(MAX_IN_AIR);
  });
  it("a group that fits in a throw isn't split across two", () => {
    const items = [..."aaaaaaaa", ..."bbbbbb"];
    const out = batches(items, g);
    expect(out).toEqual([[..."aaaaaaaa"], [..."bbbbbb"]]);
  });
  it("nothing to throw, nothing planned", () => {
    expect(batches([], g)).toEqual([]);
  });
});

describe("7e acceptance: d20 states from thrown faces", () => {
  it("disadvantage keeps the lower face", async () => {
    const r = await rollThrown(c("2d20kl1+2"), fixed([15, 4]));
    expect(r.result.natural).toBe(4);
    expect(r.result.total).toBe(6);
  });
  it("advantage with a 1 and a 20 is a crit, not a fumble", async () => {
    const r = await rollThrown(c("2d20kh1"), fixed([1, 20]));
    expect(r.result.crit).toBe(true);
    expect(r.result.fumble).toBeFalsy();
  });
  it("every die size reads back its face", async () => {
    for (const s of [4, 6, 8, 10, 12, 20]) {
      const r = await rollThrown(c(`1d${s}`), fixed([s]));
      expect(r.result.total).toBe(s);
    }
  });
});
