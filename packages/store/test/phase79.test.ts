import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_840_000_000_000;
const ranger = () => {
  const c = newCharacter({ id: "r", name: "Ranger", race: "race:human", class: "class:ranger", abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 14, cha: 10 } }, reg);
  c.classes = [{ class: "class:ranger", level: 5, subclass: "subclass:beast-master" }];
  c.hp = { current: 40, temp: 0 };
  c.companions = { "primal-beast": { form: "land", states: [] } };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const beast = (l: CharacterLog) => derive(l.character, reg).companions.find((x) => x.id === "primal-beast")!;

describe("19a: Primal Companion: Dodge unless commanded", () => {
  it("the beast is there, commanded with a bonus action", () => {
    const b = beast(ranger());
    expect(b.command).toMatchObject({ economy: "bonus", attackInstead: true });
    expect(b.commanded).toBeUndefined();
  });
  it("not commanded: it takes the Dodge action when your turn ends", () => {
    const l = ranger();
    l.record("startCombat", {});
    l.record("startTurn", {});
    expect(l.record("endTurn", {}).join(" ")).toMatch(/wasn't commanded: it takes the Dodge action/);
    expect(beast(l).states.map((x) => x.name)).toEqual(["Dodge"]);
    expect(beast(l).used.action).toBe(true);
    // Its Dodge lasts until your next turn; the turn and the command come back then.
    l.record("startTurn", {});
    expect(beast(l).states).toEqual([]);
    expect(beast(l).used.action).toBe(false);
  });
  it("commanded: any action this turn, no Dodge at the end; the command lasts one turn", () => {
    const l = ranger();
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("useAction", { action: "primal-companion" });
    l.record("companionEconomy", { companion: "primal-beast", commanded: "any" });
    expect(beast(l).commanded).toBe("any");
    expect(l.record("companionAction", { companion: "primal-beast", action: "common-dash" }).join(" ")).not.toMatch(/wasn't commanded/);
    expect(l.record("endTurn", {}).join(" ")).not.toMatch(/Dodge/);
    expect(beast(l).states).toEqual([]);
    l.record("startTurn", {});
    expect(beast(l).commanded).toBeUndefined();
  });
  it("an action it wasn't commanded to take is warned, never blocked; attacking in place of your attack allows the Attack only", () => {
    const l = ranger();
    l.record("startCombat", {});
    l.record("startTurn", {});
    expect(l.record("companionAction", { companion: "primal-beast", action: "common-dash" }).join(" ")).toMatch(/wasn't commanded.*Used anyway/);
    expect(beast(l).used.action).toBe(true);
    l.record("startTurn", {});
    l.record("useEconomy", { kind: "attack" });
    l.record("companionEconomy", { companion: "primal-beast", commanded: "attack" });
    expect(l.record("companionAction", { companion: "primal-beast", action: "common-dash" }).join(" ")).toMatch(/commanded to attack/);
  });
  it("you incapacitated: it acts as it likes, and doesn't Dodge by default", () => {
    const l = ranger();
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("addEffect", { instanceId: "inc", effect: "condition:incapacitated" });
    expect(l.record("companionAction", { companion: "primal-beast", action: "common-dash" }).join(" ")).not.toMatch(/commanded/);
    expect(l.record("endTurn", {}).join(" ")).not.toMatch(/Dodge action/);
  });
});
