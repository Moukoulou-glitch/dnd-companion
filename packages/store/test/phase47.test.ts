import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_880_000_000_000;
const bard = (level: number) => {
  const c = newCharacter({ id: "b", name: "B", race: "race:human", class: "class:bard", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 16 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, subclass: "subclass:college-of-swords" };
  c.inventory = [{ id: "r", item: "item:rapier", equipped: true }] as never;
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const flourishes = (l: CharacterLog) => derive(l.character, reg).attacks.find((a) => a.name === "Rapier")!.damage.bonus.suggestions.filter((s) => /Flourish/.test(s.label));

describe("8h: Blade Flourish", () => {
  it("three flourishes on weapon damage: the Bardic Inspiration die, one per roll, once per turn, spending a use", () => {
    const f = flourishes(bard(5));
    expect(f.map((s) => s.label)).toEqual(["Defensive Flourish", "Slashing Flourish", "Mobile Flourish"]);
    expect(f[0]).toMatchObject({ apply: { dice: ["1d8"] }, group: "flourish", oncePerTurn: true, spends: { resource: "bardic-inspiration", amount: 1 } });
  });
  it("Master's Flourish (14th): the same with a d6 and nothing spent", () => {
    const m = flourishes(bard(14)).filter((s) => /Master/.test(s.label));
    expect(m).toHaveLength(3);
    expect(m[0]!.apply.dice).toEqual(["1d6"]);
    expect(m[0]!.spends).toBeUndefined();
  });
  it("+10 ft walking speed on a turn you've attacked with the Attack action", () => {
    const l = bard(3);
    const base = derive(l.character, reg).speed.total;
    l.record("startCombat", {});
    l.record("startTurn", {});
    expect(derive(l.character, reg).speed.total).toBe(base);
    l.record("useEconomy", { kind: "attack" } as never);
    expect(derive(l.character, reg).speed.total).toBe(base + 10);
  });
  it("Defensive Flourish: the die on your AC until the start of your next turn", () => {
    const l = bard(3);
    const ac = derive(l.character, reg).ac.total;
    l.record("startCombat", {});
    l.record("addEffect", { instanceId: "df", effect: "other:defensive-flourish", choice: "5", untilTurnStart: true });
    expect(derive(l.character, reg).ac.total).toBe(ac + 5);
    l.record("startTurn", {});
    expect(derive(l.character, reg).ac.total).toBe(ac);
  });
});
