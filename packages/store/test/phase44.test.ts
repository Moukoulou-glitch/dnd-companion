import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import type { CustomCompanion } from "@dnd/schema";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_850_000_000_000;
const horse: CustomCompanion = {
  id: "h1", name: "Horse", kind: "Riding Horse", size: "Large", type: "beast", ac: 10, hpMax: 13, speed: "60 ft.",
  abilities: { str: 16, dex: 10, con: 12, int: 2, wis: 11, cha: 7 }, traits: [],
  attacks: [{ name: "Hooves", kind: "melee", toHit: 5, damage: "2d4", damageBonus: 3, damageType: "bludgeoning" }], notes: "",
};
const rider = (turn?: "own" | "yours") => {
  const c = newCharacter({ id: "r", name: "R", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
  const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  l.record("setCustomCompanion", { companion: turn ? { ...horse, turn } : horse });
  l.record("startCombat", {});
  return l;
};
const comp = (l: CharacterLog) => derive(l.character, reg).companions.find((x) => x.id === "custom-h1")!;

describe("8e: a companion's actions use its turn", () => {
  it("Dodge uses its action and is a tag until its own next turn (it rolled initiative)", () => {
    const l = rider();
    l.record("companionAction", { companion: "custom-h1", action: "common-dodge" });
    expect(comp(l).used.action).toBe(true);
    expect(comp(l).states.map((x) => x.name)).toEqual(["Dodge"]);
    // Your turn starts: its Dodge stays (it lasts until the start of its turn).
    l.record("startTurn", {});
    expect(comp(l).states.map((x) => x.name)).toEqual(["Dodge"]);
    // Its new turn: the Dodge ends and its action is back.
    const r = l.record("companionEconomy", { companion: "custom-h1", newTurn: true });
    expect(comp(l).states).toEqual([]);
    expect(comp(l).used.action).toBe(false);
    expect(r.join(" ")).toMatch(/Dodge ended/);
  });
  it("one that acts on your turn: its Dodge ends when your turn starts", () => {
    const l = rider("yours");
    l.record("companionAction", { companion: "custom-h1", action: "common-dodge" });
    l.record("startTurn", {});
    expect(comp(l).states).toEqual([]);
  });
  it("Disengage, Dash (speeds double) and Shove (one of its attacks); a second action warns but goes ahead", () => {
    const l = rider();
    l.record("companionAction", { companion: "custom-h1", action: "common-dash" });
    expect(comp(l).used).toMatchObject({ action: true, dashes: 1 });
    const again = l.record("companionAction", { companion: "custom-h1", action: "common-disengage" });
    expect(again.join(" ")).toMatch(/already used this turn\. Used anyway/);
    l.record("companionEconomy", { companion: "custom-h1", newTurn: true });
    l.record("companionAction", { companion: "custom-h1", action: "common-shove" });
    expect(comp(l).used).toMatchObject({ action: true, attacks: 1 });
  });
});
