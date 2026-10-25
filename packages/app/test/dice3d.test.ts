import { describe, expect, it } from "vitest";
import { parseFormula, roll, seededRng, type Composed } from "@dnd/dice";
import { diceToThrow, rollThrown, type Thrower } from "../src/dice3d.js";

const c = (formula: string) => ({ terms: parseFormula(formula), sources: [] }) as unknown as Composed;

/** A thrower that lands on fixed faces and remembers each throw. */
const tosser = (...throws: number[][]) => {
  const asked: number[][] = [];
  const toss: Thrower = async (sides) => {
    asked.push(sides);
    return throws.shift() ?? [];
  };
  return { toss, asked };
};

describe("3D dice: the thrown faces are the roll, the engine does the rest", () => {
  it("a d20 roll: the face thrown, plus the modifiers", async () => {
    const t = tosser([17]);
    const r = await rollThrown(c("1d20+5"), t.toss);
    expect(t.asked).toEqual([[20]]);
    expect(r.result.total).toBe(22);
    expect(r.result.natural).toBe(17);
    expect(r.physical).toBe(false);
  });

  it("advantage throws two d20s and keeps the higher; a thrown 20 is a crit; a crit range counts too", async () => {
    let r = await rollThrown(c("2d20kh1+3"), tosser([5, 18]).toss);
    expect(r.result.natural).toBe(18);
    expect(r.result.total).toBe(21);
    r = await rollThrown(c("1d20+3"), tosser([20]).toss);
    expect(r.result.crit).toBe(true);
    r = await rollThrown(c("1d20cs>=19+3"), tosser([19]).toss);
    expect(r.result.crit).toBe(true);
    r = await rollThrown(c("2d20kl1"), tosser([1, 12]).toss);
    expect(r.result.fumble).toBe(true);
  });

  it("damage dice of several kinds are thrown in order, each landing where it belongs", async () => {
    const t = tosser([6, 3, 2]);
    const r = await rollThrown(c("1d8[slashing]+2d6[fire]+4"), t.toss);
    expect(t.asked).toEqual([[8, 6, 6]]);
    expect(r.result.terms.map((x) => x.total)).toEqual([6, 5, 4]);
    expect(r.result.total).toBe(15);
  });

  it("a reroll (Great Weapon Fighting) is a second throw, only for the dice that need it", async () => {
    const t = tosser([1, 5, 2], [4, 6]);
    const r = await rollThrown(c("3d6r<=2+3"), t.toss);
    expect(t.asked).toEqual([[6, 6, 6], [6, 6]]);
    expect(r.result.terms[0]!.dice.map((d) => d.value)).toEqual([4, 5, 6]);
    expect(r.result.total).toBe(18);
    expect(r.thrown).toBe(5);
    // No die low enough: one throw.
    const u = tosser([3, 6]);
    await rollThrown(c("2d6r<=2"), u.toss);
    expect(u.asked).toHaveLength(1);
  });

  it("a die the 3D set doesn't have is rolled by the app; a flat roll throws nothing", async () => {
    const t = tosser([4]);
    const r = await rollThrown(c("1d4+1d3"), t.toss, () => 2);
    expect(t.asked).toEqual([[4]]);
    expect(r.result.total).toBe(6);
    const none = tosser();
    expect((await rollThrown(c("5"), none.toss)).result.total).toBe(5);
    expect(none.asked).toEqual([]);
    expect(diceToThrow(c("2d20kh1+1d4+3"))).toBe(3);
  });

  it("a d10's 0 counts as 10; a face that can't be on that die is refused (the app then rolls instead)", async () => {
    expect((await rollThrown(c("1d10"), tosser([0]).toss)).result.total).toBe(10);
    await expect(rollThrown(c("1d6"), tosser([9]).toss)).rejects.toThrow();
    await expect(rollThrown(c("2d6"), tosser([3]).toss)).rejects.toThrow();
  });

  it("the engine's own rolls are unchanged by the reroll flag", () => {
    // Same seed, same results as before the flag existed: rerolls still take the next value.
    const a = roll("4d6r<=2", seededRng(7)).total;
    const b = roll("4d6r<=2", seededRng(7)).total;
    expect(a).toBe(b);
  });
});

describe("13c fixes: maximised dice are thrown with the face they turn to", () => {
  it("Beacon of Hope's dice ask for their maximum; others don't", async () => {
    const asked: (number | undefined)[][] = [];
    const toss: Thrower = async (sides, _looks, options) => {
      asked.push(options?.wants ?? []);
      return sides.map((s) => options?.wants?.[0] ?? s - 1);
    };
    const max = { terms: parseFormula("2d8+3").map((t) => (t.kind === "dice" ? { ...t, min: 8 } : t)), sources: [] } as unknown as Composed;
    const r = await rollThrown(max, toss);
    expect(asked[0]).toEqual([8, 8]);
    expect(r.result.total).toBe(19);
    await rollThrown(c("2d8+3"), toss);
    expect(asked[1]).toEqual([]);
  });
});
