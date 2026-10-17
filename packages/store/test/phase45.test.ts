import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import type { CustomCompanion } from "@dnd/schema";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_860_000_000_000;
const horse: CustomCompanion = {
  id: "h1", name: "Horse", kind: "Riding Horse", size: "Large", type: "beast", ac: 10, hpMax: 13, speed: "60 ft.",
  abilities: { str: 16, dex: 10, con: 12, int: 2, wis: 11, cha: 7 }, traits: [],
  attacks: [{ name: "Hooves", kind: "melee", toHit: 5, damage: "2d4", damageBonus: 3, damageType: "bludgeoning" }], notes: "",
};
const owner = () => {
  const c = newCharacter({ id: "o", name: "O", race: "race:human", class: "class:cleric", abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
  const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  l.record("setCustomCompanion", { companion: horse });
  return l;
};
const H = "custom-h1";
const comp = (l: CharacterLog) => derive(l.character, reg).companions.find((x) => x.id === H);

describe("8f: dismissing a companion", () => {
  it("until summoned again: away, out of the fight, its hit points kept; then back", () => {
    const l = owner();
    l.record("damage", { amount: 5, companion: H });
    l.record("startCombat", {});
    l.record("companionAction", { companion: H, action: "common-dodge" });
    l.record("dismissCompanion", { companion: H, how: "away" });
    expect(comp(l)!.away).toBe(true);
    expect(comp(l)!.states).toEqual([]);
    expect(comp(l)!.form!.hp.current).toBe(8);
    l.record("dismissCompanion", { companion: H, how: "back" });
    expect(comp(l)!.away).toBeUndefined();
    expect(comp(l)!.form!.hp.current).toBe(8);
  });
  it("total: one you made is deleted", () => {
    const l = owner();
    l.record("dismissCompanion", { companion: H, how: "total" });
    expect(comp(l)).toBeUndefined();
    expect(l.character.customCompanions).toEqual([]);
  });
});

describe("8f: total dismiss of a feature's companion", () => {
  it("the Wildfire Spirit is gone until summoned again", () => {
    const c = newCharacter({ id: "d", name: "D", race: "race:human", class: "class:druid", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 2, subclass: "subclass:circle-of-wildfire" };
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("setCompanion", { companion: "wildfire-spirit", form: "wildfire-spirit" });
    expect(derive(l.character, reg).companions.find((x) => x.id === "wildfire-spirit")!.form).toBeDefined();
    l.record("dismissCompanion", { companion: "wildfire-spirit", how: "total" });
    expect(derive(l.character, reg).companions.find((x) => x.id === "wildfire-spirit")!.form).toBeUndefined();
  });
});

describe("8f: effects on a companion", () => {
  it("Bless: +1d4 on its attacks and saves; Haste: AC +2, speeds doubled", () => {
    const l = owner();
    l.record("companionEffect", { companion: H, effect: "effect:bless", add: true, rounds: 10 });
    l.record("companionEffect", { companion: H, effect: "effect:haste", add: true, rounds: 10 });
    const c = comp(l)!;
    expect(c.effects.map((e) => e.name)).toEqual(["Bless", "Haste"]);
    expect(c.form!.attacks[0]!.attack.dice).toEqual([expect.objectContaining({ dice: "1d4" })]);
    expect(c.form!.abilities.con.save.dice).toEqual([expect.objectContaining({ dice: "1d4" })]);
    expect(c.form!.ac.total).toBe(12);
    expect(c.form!.speeds.walk).toBe(120);
  });
  it("Protection from Energy (fire): it takes half fire damage", () => {
    const l = owner();
    l.record("companionEffect", { companion: H, effect: "effect:protection-from-energy", add: true, choice: "Fire" });
    expect(comp(l)!.form!.defenses.resist).toEqual(["fire"]);
    const notes = l.record("damage", { amount: 9, companion: H, damageType: "fire" });
    expect(comp(l)!.form!.hp.current).toBe(9);
    expect(notes.join(" ")).toMatch(/resists fire: 4 instead of 9/);
  });
  it("timed: counts down at the start of its own turn in combat, and ends at 0", () => {
    const l = owner();
    l.record("startCombat", {});
    l.record("companionEffect", { companion: H, effect: "effect:bless", add: true, rounds: 2 });
    l.record("companionEconomy", { companion: H, newTurn: true });
    expect(comp(l)!.effects[0]!.rounds).toBe(1);
    const n = l.record("companionEconomy", { companion: H, newTurn: true });
    expect(comp(l)!.effects).toEqual([]);
    expect(n.join(" ")).toMatch(/Ended on Horse: Bless/);
  });
  it("your concentration spell on it ends with your concentration; ending one by hand", () => {
    const l = owner();
    l.record("companionEffect", { companion: H, effect: "effect:bless", add: true, concentration: true });
    l.record("companionEffect", { companion: H, effect: "effect:aid", add: true });
    l.record("castSpell", { spell: "spell:bless", list: "cleric", level: 1, using: "slot" });
    expect(l.character.concentration?.name).toBe("Bless");
    l.record("endConcentration", {});
    expect(comp(l)!.effects.map((e) => e.name)).toEqual(["Aid"]);
    const id = comp(l)!.effects[0]!.id;
    l.record("companionEffect", { companion: H, effect: "effect:aid", add: false, instance: id });
    expect(comp(l)!.effects).toEqual([]);
  });
});
