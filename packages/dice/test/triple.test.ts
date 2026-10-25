import { describe, expect, it } from "vitest";
import { composeD20 } from "../src/index.js";

const base = { total: 5, parts: [{ label: "Dexterity", value: 5 }], dice: [], advantage: [] as string[], disadvantage: [] as string[], suggestions: [], tripleAdvantage: "Elven Accuracy" };
describe("13c: Elven Accuracy, three d20s with advantage", () => {
  it("three dice keep the highest only when there's advantage", () => {
    const adv = composeD20({ ...base, advantage: ["Flanking"] });
    expect(adv.terms[0]).toMatchObject({ count: 3, sides: 20, keep: { which: "highest", n: 1 } });
    expect(adv.sources[0]).toMatch(/Elven Accuracy: three dice/);
    expect(composeD20(base).terms[0]).toMatchObject({ count: 1 });
    expect(composeD20({ ...base, disadvantage: ["Prone target"] }).terms[0]).toMatchObject({ count: 2, keep: { which: "lowest" } });
    // Advantage and disadvantage cancel: a normal roll.
    expect(composeD20({ ...base, advantage: ["A"], disadvantage: ["B"] }).terms[0]).toMatchObject({ count: 1 });
  });
});
