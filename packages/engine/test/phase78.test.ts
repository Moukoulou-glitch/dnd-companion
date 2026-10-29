import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (cls: string, level: number, subclass: string, extra: Record<string, unknown> = {}) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 14, dex: 14, con: 14, int: 16, wis: 14, cha: 16 }, race: "race:human", classes: [{ class: cls, level, subclass }], hp: { current: 30, temp: 0 }, ...extra }), reg);
const act = (s: ReturnType<typeof derive>, id: string) => s.actions.find((a) => a.id === id)!;

describe("14c: lines on other actions", () => {
  it("Arcane Charge on Action Surge, Instinctive Pounce on Rage, Runic Juggernaut on Giant's Might", () => {
    expect(act(pc("class:fighter", 15, "subclass:eldritch-knight"), "action-surge").note).toMatch(/Arcane Charge: you can also teleport up to 30 ft/);
    expect(act(pc("class:fighter", 14, "subclass:eldritch-knight"), "action-surge").note ?? "").not.toMatch(/Arcane Charge/);
    expect(act(pc("class:fighter", 18, "subclass:rune-knight"), "giants-might").note).toMatch(/Runic Juggernaut: you can become Huge/);
  });
  it("Hold the Line and Vigilant Defender on opportunity attacks", () => {
    const n = act(pc("class:fighter", 18, "subclass:cavalier"), "common-opportunity-attack").note!;
    expect(n).toMatch(/Hold the Line/);
    expect(n).toMatch(/Vigilant Defender/);
  });
  it("Guardian Spirit: half your druid level; Creative Crescendo: your Charisma modifier", () => {
    expect(act(pc("class:druid", 10, "subclass:circle-of-the-shepherd"), "spirit-totem").note).toMatch(/regains 5 hit points/);
    expect(act(pc("class:bard", 14, "subclass:college-of-creation"), "performance-of-creation").note).toMatch(/Charisma modifier \(3\)/);
  });
  it("Mote of Potential and Unfailing Inspiration on Bardic Inspiration", () => {
    expect(act(pc("class:bard", 3, "subclass:college-of-creation"), "bardic-inspiration").note).toMatch(/Mote of Potential: .*\(3\)/);
    expect(act(pc("class:bard", 6, "subclass:college-of-eloquence"), "bardic-inspiration").note).toMatch(/Unfailing Inspiration: .*keeps the die/);
  });
});

describe("14c: rolled twice", () => {
  it("Controlled Surge: the Wild Surge twice; Controlled Chaos: the surge table twice", () => {
    expect(act(pc("class:barbarian", 13, "subclass:path-of-wild-magic"), "wild-surge").roll?.times).toBeUndefined();
    expect(act(pc("class:barbarian", 14, "subclass:path-of-wild-magic"), "wild-surge").roll?.times).toBe(2);
    expect(act(pc("class:sorcerer", 1, "subclass:wild-magic"), "wild-magic-surge-table").roll?.times).toBeUndefined();
    expect(act(pc("class:sorcerer", 14, "subclass:wild-magic"), "wild-magic-surge-table").roll?.times).toBe(2);
  });
});

describe("14c: Master Scrivener, Emissary of Redemption, Bestial Fury", () => {
  it("Master Scrivener offers the 1st- and 2nd-level spells in your spellbook", () => {
    const spells = ["spell:magic-missile", "spell:misty-step", "spell:fireball"].map((spell) => ({ spell, list: "wizard", prepared: false }));
    const a = act(pc("class:wizard", 10, "subclass:order-of-scribes", { spells }), "master-scrivener");
    expect(a.choose?.options).toEqual(["Magic Missile", "Misty Step"]);
    expect(a.scribesScroll).toEqual({ list: "wizard", maxLevel: 2, higher: 1 });
  });
  it("Emissary of Redemption: on you after each long rest", () => {
    expect(pc("class:paladin", 20, "subclass:oath-of-redemption").afterLongRest).toEqual([{ effect: "effect:emissary-of-redemption", from: "Emissary of Redemption" }]);
  });
  it("Bestial Fury: the primal beast makes two attacks from 11th level", () => {
    const beast = (l: number) => pc("class:ranger", l, "subclass:beast-master", { companions: { "primal-beast": { form: "land" } } }).companions.find((c) => c.id === "primal-beast")!;
    expect(beast(10).form?.attacksPerAction).toBe(1);
    expect(beast(11).form?.attacksPerAction).toBe(2);
  });
});
