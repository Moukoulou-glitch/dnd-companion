import { describe, expect, it } from "vitest";
import { FormulaError, critFormula, describeTerm, formatFormula, parseFormula, roll, scriptedRng, secureRng, seededRng } from "../src/index.js";

describe("parsing", () => {
  it("reads common formulas", () => {
    expect(parseFormula("1d20+5")).toEqual([
      { kind: "dice", sign: 1, count: 1, sides: 20 },
      { kind: "flat", sign: 1, value: 5 },
    ]);
    expect(parseFormula("d%")[0]).toMatchObject({ count: 1, sides: 100 });
    expect(parseFormula("2d20kh1 + 7 - 1")).toHaveLength(3);
  });

  it("reads modifiers and damage types", () => {
    expect(parseFormula("2d6r<=2[slashing]")[0]).toEqual({ kind: "dice", sign: 1, count: 2, sides: 6, rerollAtOrBelow: 2, label: "slashing" });
    expect(parseFormula("1d20min10cs>=19")[0]).toMatchObject({ min: 10, critAtOrAbove: 19 });
    expect(parseFormula("2d20kl1")[0]).toMatchObject({ keep: { which: "lowest", n: 1 } });
  });

  it("round-trips through formatFormula", () => {
    for (const f of ["1d20+5", "2d20kh1+7", "1d8[piercing]+3+2d6[fire]", "2d6r<=2-1", "1d20min10cs>=19"]) {
      expect(formatFormula(parseFormula(f))).toBe(f);
    }
  });

  it("explains bad input instead of guessing", () => {
    expect(() => parseFormula("")).toThrow(FormulaError);
    expect(() => parseFormula("1d20++5")).toThrow(/Two signs/);
    expect(() => parseFormula("abc")).toThrow(/Can't read/);
    expect(() => parseFormula("1d1")).toThrow(/sides/);
    expect(() => parseFormula("2d20kh3")).toThrow(/keep 3 of 2/);
    expect(() => parseFormula("1d4r4")).toThrow(/never stop/);
  });
});

describe("rolling", () => {
  it("adds dice and flat values", () => {
    const r = roll("2d6+3", scriptedRng([4, 5]));
    expect(r.total).toBe(12);
    expect(describeTerm(r.terms[0]!)).toBe("+2d6 [4, 5]");
  });

  it("advantage keeps the higher d20, disadvantage the lower", () => {
    expect(roll("2d20kh1+5", scriptedRng([7, 16])).total).toBe(21);
    const dis = roll("2d20kl1+5", scriptedRng([7, 16]));
    expect(dis.total).toBe(12);
    expect(dis.natural).toBe(7);
    expect(describeTerm(dis.terms[0]!)).toBe("+2d20 [7, (16)]");
  });

  it("natural 20 is a crit, natural 1 a fumble; crit range lowers the threshold", () => {
    expect(roll("1d20+3", scriptedRng([20]))).toMatchObject({ crit: true, fumble: false, natural: 20 });
    expect(roll("1d20+3", scriptedRng([1]))).toMatchObject({ crit: false, fumble: true });
    expect(roll("1d20cs>=19+3", scriptedRng([19])).crit).toBe(true);
    expect(roll("1d20+3", scriptedRng([19])).crit).toBe(false);
  });

  it("a crit with advantage counts the kept die", () => {
    expect(roll("2d20kh1", scriptedRng([20, 3])).crit).toBe(true);
    expect(roll("2d20kl1", scriptedRng([20, 3])).crit).toBe(false);
  });

  it("rerolls once and keeps the new result (Great Weapon Fighting)", () => {
    const r = roll("2d6r<=2", scriptedRng([1, 2, 5]));
    expect(r.terms[0]!.dice).toEqual([
      { rolled: 1, rerolled: 2, value: 2, dropped: false },
      { rolled: 5, value: 5, dropped: false },
    ]);
    expect(r.total).toBe(7);
  });

  it("minimum raises low dice but a natural 1 is still a 1 (Reliable Talent)", () => {
    const r = roll("1d20min10+9", scriptedRng([3]));
    expect(r.total).toBe(19);
    expect(r.natural).toBe(3);
    expect(describeTerm(r.terms[0]!)).toBe("+1d20 [3→10]");
  });

  it("negative terms subtract", () => {
    expect(roll("1d20-5", scriptedRng([12])).total).toBe(7);
    expect(roll("10-1d4", scriptedRng([3])).total).toBe(7);
  });

  it("physical dice entry rejects impossible results", () => {
    expect(() => roll("1d20", scriptedRng([21]))).toThrow(/not a possible result/);
    expect(() => roll("2d6", scriptedRng([3]))).toThrow(/Not enough/);
  });
});

describe("critical damage (2014)", () => {
  it("doubles the dice, not the modifiers", () => {
    const crit = critFormula(parseFormula("1d8[piercing]+3+2d6[fire]"));
    expect(formatFormula(crit)).toBe("2d8[piercing]+3+4d6[fire]");
  });

  it("Brutal Critical adds weapon dice to the first term only", () => {
    expect(formatFormula(critFormula(parseFormula("1d8+4+1d6"), 1))).toBe("3d8+4+2d6");
  });
});

describe("random sources", () => {
  it("secure rolls stay in range and hit every face", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = secureRng(6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it("seeded rolls repeat exactly", () => {
    expect(roll("4d6", seededRng(42)).total).toBe(roll("4d6", seededRng(42)).total);
  });

  it("d20 results are close to uniform", () => {
    const rng = seededRng(7);
    const counts = new Array(21).fill(0);
    for (let i = 0; i < 20000; i++) counts[rng(20)]++;
    for (let f = 1; f <= 20; f++) expect(counts[f]).toBeGreaterThan(850);
  });
});
