import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (cls: string, level: number, subclass: string, extra: Record<string, unknown> = {}) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 16 }, race: "race:human", classes: [{ class: cls, level, subclass }], hp: { current: 30, temp: 0 }, ...extra }), reg);
const book = (ids: string[]) => ({ spells: ids.map((spell) => ({ spell, list: "wizard", prepared: true })) });

describe("14d: Counterspell and Dispel Magic", () => {
  it("an Intelligence check for a wizard; Improved Abjuration adds the proficiency bonus", () => {
    const plain = pc("class:wizard", 10, "subclass:evocation", book(["spell:counterspell", "spell:dispel-magic"]));
    const cs = plain.spells.find((x) => x.id === "spell:counterspell")!;
    expect(cs.check?.ability).toBe("int");
    expect(cs.check?.roll.total).toBe(3);
    expect(plain.spells.find((x) => x.id === "spell:dispel-magic")?.check?.text).toMatch(/One check for each/);
    const abj = pc("class:wizard", 10, "subclass:school-of-abjuration", book(["spell:counterspell"])).spells.find((x) => x.id === "spell:counterspell")!;
    expect(abj.check?.roll.total).toBe(3 + 4);
    expect(JSON.stringify(abj.check?.roll.parts)).toMatch(/Improved Abjuration/);
  });
  it("a sorcerer's is a Charisma check; spells without one have none", () => {
    const s = pc("class:sorcerer", 5, "subclass:draconic", { spells: [{ spell: "spell:counterspell", list: "sorcerer", prepared: true }, { spell: "spell:fireball", list: "sorcerer", prepared: true }] });
    expect(s.spells.find((x) => x.id === "spell:counterspell")?.check?.ability).toBe("cha");
    expect(s.spells.find((x) => x.id === "spell:fireball")?.check).toBeUndefined();
  });
});

describe("14d: Heroes' Feast and Goodberry", () => {
  it("Heroes' Feast: the rolled increase, poison and fear immunity, advantage on Wisdom saves", () => {
    const before = pc("class:cleric", 11, "subclass:life").hpMax.total;
    const s = pc("class:cleric", 11, "subclass:life", { effects: [{ id: "h", effect: "effect:heroes-feast", choice: "14", minutes: 1440 }] });
    expect(s.hpMax.total).toBe(before + 14);
    expect(s.defenses.immune).toEqual(expect.arrayContaining(["poison", "poisoned", "frightened"]));
    expect(s.saves.wis.advantage).toContain("Heroes' Feast");
  });
  it("Goodberry: ten berries, each heals 1", () => {
    const s = pc("class:druid", 1, "subclass:circle-of-the-moon", { effects: [{ id: "g", effect: "effect:goodberry", minutes: 1440 }] });
    expect(s.effects.find((e) => e.instanceId === "g")?.counter).toMatchObject({ left: 10, start: 10, use: { label: "Eat a berry", heal: 1 } });
  });
});
