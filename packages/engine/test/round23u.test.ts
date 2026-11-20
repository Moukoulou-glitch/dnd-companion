import { describe, expect, it } from "vitest";
import { derive, itemWeight, newCharacter, summonOptions } from "../src/index.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (cls: string, level: number, ab: Record<string, number>) => {
  const c = newCharacter({ id: "p", name: "P", race: "race:human", class: cls, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...ab } }, reg);
  c.classes = [{ class: cls, level }];
  return c;
};

describe("23u: prepared spells", () => {
  it("a paladin prepares Charisma modifier + half the paladin level, rounded down (minimum 1)", () => {
    const sc = (lvl: number, cha: number) => derive(pc("class:paladin", lvl, { cha }), reg).spellcasting.find((s) => s.id === "paladin")!.prepared!.max;
    expect(sc(3, 16)).toBe(4); // a human: Charisma 17, +3
    expect(sc(5, 14)).toBe(4);
    expect(sc(2, 8)).toBe(1);
  });
  it("clerics, druids and wizards still add their whole level", () => {
    expect(derive(pc("class:cleric", 3, { wis: 16 }), reg).spellcasting.find((s) => s.id === "cleric")!.prepared!.max).toBe(6);
    expect(derive(pc("class:wizard", 5, { int: 18 }), reg).spellcasting.find((s) => s.id === "wizard")!.prepared!.max).toBe(9);
  });
});

describe("23u: items sold by length or count", () => {
  it("a rope keeps its own length, and its weight follows", () => {
    const rope = reg.find("item:rope-hempen-50-feet", "item")!;
    expect(rope.measure).toEqual({ unit: "ft", per: 50, step: 5 });
    expect(itemWeight(rope, { quantity: 1 })).toBe(10);
    expect(itemWeight(rope, { quantity: 1, amount: 30 })).toBe(6);
    expect(itemWeight(rope, { quantity: 2, amount: 25 })).toBe(10);
    for (const id of ["item:rope-silk-50-feet", "item:chain-10-feet", "item:string-10-feet", "item:ball-bearings-bag-of-1-000", "item:caltrops"]) expect(reg.find(id, "item")?.measure).toBeTruthy();
  });
});

describe("23u: items that bring creatures", () => {
  it.each([
    ["item:efreeti-bottle", "summon:efreeti-bottle", "Efreeti"],
    ["item:ring-of-djinni-summoning", "summon:ring-of-djinni-summoning", "Djinni"],
    ["item:staff-of-the-python", "summon:staff-of-the-python", "Giant Constrictor Snake"],
    ["item:pipes-of-the-sewers", "summon:pipes-of-the-sewers", "Swarm of Rats"],
  ])("%s opens %s", (item, summon, creature) => {
    const def = reg.find(item, "item")!;
    expect(def.grant?.actions?.some((a) => a.opensSummon?.summon === summon)).toBe(true);
    expect(summonOptions(reg, summon, 1)!.creatures.map((x) => x.name)).toContain(creature);
  });
  it("the Iron Flask releases any creature you pick", () => {
    const o = summonOptions(reg, "summon:iron-flask", 1)!;
    expect(o.creatures.length).toBeGreaterThan(100);
    expect(o.creatures.some((x) => x.name === "Djinni")).toBe(true);
  });
  it("the efreeti bottle's d100 table has a line for every face", () => {
    const a = reg.find("item:efreeti-bottle", "item")!.grant!.actions!.find((x) => x.id === "efreeti-bottle")!;
    expect(a.roll?.table).toHaveLength(100);
  });
});

describe("23v: figurines and other carried items", () => {
  it("work from the pack, without equipping them", () => {
    const c = pc("class:fighter", 3, {});
    c.inventory.push({ id: "dog", item: "item:figurine-of-wondrous-power-onyx-dog", quantity: 1, equipped: false, attuned: false });
    c.inventory.push({ id: "cloak", item: "item:cloak-of-protection", quantity: 1, equipped: false, attuned: false });
    const s = derive(c, reg);
    expect(s.actions.some((a) => a.id === "figurine-onyx-dog")).toBe(true);
    // A worn item still needs to be worn.
    expect(s.ac.total).toBe(derive(pc("class:fighter", 3, {}), reg).ac.total);
  });
  it.each([
    ["item:figurine-of-wondrous-power-silver-raven", "summon:figurine-silver-raven", "Raven"],
    ["item:figurine-of-wondrous-power-ebony-fly", "summon:figurine-ebony-fly", "Giant Fly"],
  ])("%s opens %s", (item, summon, creature) => {
    expect(reg.find(item, "item")!.grant?.actions?.some((a) => a.opensSummon?.summon === summon)).toBe(true);
    expect(summonOptions(reg, summon, 1)!.creatures.map((x) => x.name)).toEqual([creature]);
  });
});

describe("23w: dao and marid", () => {
  it("are in the Iron Flask's choices, with their attacks", () => {
    const names = summonOptions(reg, "summon:iron-flask", 1)!.creatures.map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(["Dao", "Marid", "Djinni", "Efreeti"]));
    const marid = reg.find("creature:marid", "creature")!;
    expect(marid.hp).toBe(229);
    expect(marid.actions.find((a) => a.name === "Trident")?.attack?.toHit).toBe(10);
    expect(reg.find("creature:dao", "creature")!.conditionImmune).toEqual(["petrified"]);
  });
});
