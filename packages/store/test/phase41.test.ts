import { describe, expect, it } from "vitest";
import { attacksPerAction, derive, newCharacter, speedsOf } from "@dnd/engine";
import type { CustomCompanion } from "@dnd/schema";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_840_000_000_000;
/** A 2nd-level Circle of Wildfire druid with her Wildfire Spirit out. */
const druid = () => {
  const c = newCharacter({ id: "d", name: "D", race: "race:human", class: "class:druid", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 2, subclass: "subclass:circle-of-wildfire" };
  const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  l.record("setCompanion", { companion: "wildfire-spirit", form: "wildfire-spirit" });
  return l;
};
const wolf: CustomCompanion = {
  id: "w1",
  name: "Grey",
  kind: "Pet",
  size: "Medium",
  type: "beast",
  ac: 13,
  hpMax: 11,
  speed: "40 ft.",
  abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
  traits: [],
  attacks: [{ name: "Bite", kind: "melee", toHit: 4, damage: "2d4", damageBonus: 2, damageType: "piercing" }],
  notes: "",
};
const comp = (l: CharacterLog, id: string) => derive(l.character, reg).companions.find((x) => x.id === id)!;

describe("Companions in combat: their own initiative and turn", () => {
  it("reads speeds and Multiattack from a stat block", () => {
    expect(speedsOf("40 ft., swim 30 ft., fly 60 ft. (hover)")).toEqual({ walk: 40, swim: 30, fly: 60 });
    expect(speedsOf("fly 30 ft.")).toEqual({ fly: 30, walk: 0 });
    expect(attacksPerAction([{ name: "Multiattack", summary: "It makes two attacks: one with its bite and one with its claws." }])).toBe(2);
    expect(attacksPerAction([{ name: "Bite", summary: "" }])).toBe(1);
  });

  it("each follows its own rules: right after you, on your turn, or its own initiative", () => {
    const l = druid();
    expect(comp(l, "wildfire-spirit").turn).toBe("after");
    l.record("setCustomCompanion", { companion: wolf });
    expect(comp(l, "custom-w1").turn).toBe("own");
    l.record("setCustomCompanion", { companion: { ...wolf, turn: "yours" } });
    expect(comp(l, "custom-w1").turn).toBe("yours");
    expect(comp(l, "wildfire-spirit").form?.speeds).toEqual({ walk: 30, fly: 30 });
  });

  it("its turn: action, attacks, movement with a warning past its speed, Dash, a new turn", () => {
    const l = druid();
    l.record("setCustomCompanion", { companion: wolf });
    l.record("startCombat", {});
    l.record("companionInitiative", { companion: "custom-w1", value: 17 });
    expect(comp(l, "custom-w1").initiative).toBe(17);
    l.record("companionEconomy", { companion: "custom-w1", kind: "attack", used: true });
    expect(comp(l, "custom-w1").used).toMatchObject({ action: true, attacks: 1 });
    const again = l.record("companionEconomy", { companion: "custom-w1", kind: "attack", used: true });
    expect(again.join(" ")).toMatch(/attack 2 of 1/);
    l.record("companionEconomy", { companion: "custom-w1", kind: "bonus", used: true });
    expect(l.record("companionEconomy", { companion: "custom-w1", move: 45, mode: "walk" }).join(" ")).toMatch(/45 ft is beyond Grey's walk speed \(40 ft\)/);
    l.record("companionEconomy", { companion: "custom-w1", dash: true });
    expect(comp(l, "custom-w1").used.dashes).toBe(1);
    l.record("companionEconomy", { companion: "custom-w1", newTurn: true });
    expect(comp(l, "custom-w1").used).toEqual({ action: false, bonus: false, reaction: false, attacks: 0, moved: 0, dashes: 0 });
  });

  it("your turn starting gives back the turn of those that act with you, not of one with its own initiative", () => {
    const l = druid();
    l.record("setCustomCompanion", { companion: wolf });
    l.record("startCombat", {});
    l.record("companionEconomy", { companion: "wildfire-spirit", kind: "action", used: true });
    l.record("companionEconomy", { companion: "custom-w1", kind: "action", used: true });
    l.record("startTurn", {});
    expect(comp(l, "wildfire-spirit").used.action).toBe(false);
    expect(comp(l, "custom-w1").used.action).toBe(true);
  });

  it("a new combat starts everyone fresh; ending it clears their initiative; it all replays", () => {
    const l = druid();
    l.record("setCustomCompanion", { companion: wolf });
    l.record("startCombat", {});
    l.record("companionInitiative", { companion: "custom-w1", value: 12 });
    l.record("companionEconomy", { companion: "custom-w1", kind: "reaction", used: true });
    const replay = new CharacterLog(l.base, reg, new HybridClock("t", () => (t += 1000)), "player", [...l.operations]);
    expect(derive(replay.character, reg).companions.find((x) => x.id === "custom-w1")).toMatchObject({ initiative: 12, used: { reaction: true } });
    l.record("endCombat", {});
    expect(comp(l, "custom-w1").initiative).toBeUndefined();
    l.record("startCombat", {});
    expect(comp(l, "custom-w1").used.reaction).toBe(false);
  });
});
