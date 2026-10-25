import { describe, expect, it } from "vitest";
import { composeD20, parseFormula, rerollDie, rollComposed, scriptedRng, type Composed } from "../src/index.js";

describe("13c fixes: one die rolled again", () => {
  it("the chosen die's new face counts, totals follow; minimums still hold", () => {
    const c: Composed = { terms: parseFormula("2d6+3"), sources: ["Rapier", ""], advantageFrom: [], disadvantageFrom: [] };
    const r = rollComposed(c, [1, 4]);
    expect(r.result.total).toBe(8);
    const again = rerollDie(r, 0, 0, 6);
    expect(again.result.total).toBe(13);
    expect(again.result.terms[0]!.dice[0]).toMatchObject({ rolled: 1, rerolled: 6, value: 6 });
    // Lower is kept too: the new roll counts.
    expect(rerollDie(r, 0, 1, 2).result.total).toBe(6);
    const min = { ...c, terms: c.terms.map((t) => (t.kind === "dice" ? { ...t, min: 3 } : t)) } as Composed;
    expect(rerollDie(rollComposed(min, [5, 5], scriptedRng([5, 5])), 0, 0, 1).result.terms[0]!.dice[0]).toMatchObject({ value: 3, raised: true });
  });
  it("Elven Accuracy through a ticked option: three d20s with advantage", () => {
    const base = { total: 4, parts: [], dice: [], advantage: ["Flanking"], disadvantage: [], suggestions: [{ label: "Hex Warrior", effect: "+3", apply: { flat: 3, dice: [], tripleAdvantage: "Elven Accuracy" } }] };
    expect(composeD20(base).terms[0]).toMatchObject({ count: 2 });
    expect(composeD20(base, { enabled: ["Hex Warrior"], manual: "none", extra: 0 }).terms[0]).toMatchObject({ count: 3 });
  });
});
