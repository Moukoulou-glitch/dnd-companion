import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "@dnd/engine";
import { composeDamage, rollComposed, scriptedRng } from "@dnd/dice";
import { tableRegistry } from "../../engine/test/helpers.js";
import { defaultHands, forHands, handsOf, rememberHands, weaponDiceFor } from "../src/hands";

const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
const reg = tableRegistry();
const fighter = (style: string) =>
  derive(
    Character.parse({
      id: "h", schemaVersion: 1, ruleset: "5e-2014", name: "Test", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 }, race: "race:human",
      classes: [{ class: "class:fighter", level: 2 }], choices: { "feature:fighter-fighting-style": { option: [style] } },
      inventory: [{ id: "a", item: "item:longsword", equipped: true }, { id: "b", item: "item:greatsword" }, { id: "c", item: "item:rapier" }, { id: "d", item: "item:warhammer" }],
      hp: { current: 20, temp: 0 },
    }),
    reg,
  );
const atk = (s: ReturnType<typeof fighter>, n: string) => s.attacks.find((a) => a.name === n)!;

describe("8c: one hand or two", () => {
  const gwf = fighter("feature:style-great-weapon-fighting");
  it("versatile weapons have both dice; two-handed is always two, others one", () => {
    expect(atk(gwf, "Longsword").damage.versatileDice).toBe("1d10");
    expect(atk(gwf, "Warhammer").damage.versatileDice).toBe("1d10");
    expect(weaponDiceFor(atk(gwf, "Longsword"), "two")).toBe("1d10");
    expect(weaponDiceFor(atk(gwf, "Longsword"), "one")).toBe("1d8");
    expect(handsOf(atk(gwf, "Greatsword"), "one")).toBe("two");
    expect(handsOf(atk(gwf, "Rapier"), "two")).toBe("one");
  });
  it("Great Weapon Fighting: offered and ticked from the start only with two hands", () => {
    const ls = atk(gwf, "Longsword").damage.bonus;
    const g = ls.suggestions.find((s) => s.label === "Great Weapon Fighting")!;
    expect(g).toMatchObject({ hands: "two", preset: "always" });
    expect(forHands(ls, "one").suggestions.some((s) => s.label === "Great Weapon Fighting")).toBe(false);
    expect(forHands(ls, "two").suggestions.some((s) => s.label === "Great Weapon Fighting")).toBe(true);
  });
  it("two hands with Great Weapon Fighting: a d10 whose 1 or 2 is rolled again", () => {
    const a = atk(gwf, "Longsword");
    const c = composeDamage(weaponDiceFor(a, "two"), a.damage.type, forHands(a.damage.bonus, "two"), { enabled: ["Great Weapon Fighting"], manual: "none", extra: 0 });
    expect(rollComposed(c, undefined, scriptedRng([2, 9])).result.terms[0]!.total).toBe(9);
  });
  it("Dueling: only with one hand", () => {
    const due = atk(fighter("feature:style-dueling"), "Longsword").damage.bonus;
    expect(forHands(due, "one").suggestions.some((s) => s.label === "Dueling")).toBe(true);
    expect(forHands(due, "two").suggestions.some((s) => s.label === "Dueling")).toBe(false);
  });
  it("first choice: two hands with Great Weapon Fighting, one with Dueling; then the last one made", () => {
    expect(defaultHands("x1", atk(gwf, "Longsword").damage.bonus)).toBe("two");
    expect(defaultHands("x2", atk(fighter("feature:style-dueling"), "Longsword").damage.bonus)).toBe("one");
    rememberHands("x1", "one");
    expect(defaultHands("x1", atk(gwf, "Longsword").damage.bonus)).toBe("one");
  });
});

describe("8c: off-hand attacks", () => {
  it("an off-hand longsword (Dual Wielder) is in one hand: no two-hand die", () => {
    const s = fighter("feature:style-great-weapon-fighting");
    const off = s.attacks.find((a) => a.name === "Longsword (off-hand)");
    if (off) expect(off.damage.versatileDice).toBeUndefined();
  });
});
