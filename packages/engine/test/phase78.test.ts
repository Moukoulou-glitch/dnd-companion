import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (cls: string, level: number, subclass: string, extra: Record<string, unknown> = {}) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 14, dex: 14, con: 14, int: 16, wis: 14, cha: 16 }, race: "race:human", classes: [{ class: cls, level, subclass }], hp: { current: 30, temp: 0 }, ...extra }), reg);
const act = (s: ReturnType<typeof derive>, id: string) => s.actions.find((a) => a.id === id)!;

describe("14c: lines on other actions", () => {
  it("Arcane Charge on Action Surge, Instinctive Pounce on Rage", () => {
    expect(act(pc("class:fighter", 15, "subclass:eldritch-knight"), "action-surge").note).toMatch(/Arcane Charge: you can also teleport up to 30 ft/);
    expect(act(pc("class:fighter", 14, "subclass:eldritch-knight"), "action-surge").note ?? "").not.toMatch(/Arcane Charge/);
  });
  it("Hold the Line and Vigilant Defender on opportunity attacks", () => {
    const n = act(pc("class:fighter", 18, "subclass:cavalier"), "common-opportunity-attack").note!;
    expect(n).toMatch(/Hold the Line/);
    expect(n).toMatch(/Vigilant Defender/);
  });
  it("Creative Crescendo: your Charisma modifier", () => {
    expect(act(pc("class:bard", 14, "subclass:college-of-creation"), "performance-of-creation").note).toMatch(/Charisma modifier \(3\)/);
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

describe("14c fixes", () => {
  it("Runic Juggernaut: Giant's Might asks Large or Huge; your size and reach follow", () => {
    const at18 = (toggles: string[]) => pc("class:fighter", 18, "subclass:rune-knight", { toggles, inventory: [{ id: "g", item: "item:greatsword", quantity: 1, equipped: true, attuned: false }] });
    const gm = at18([]).actions.filter((a) => a.id === "giants-might");
    expect(gm).toHaveLength(1);
    expect(gm[0]!.choose?.options).toEqual(["Large", "Huge"]);
    expect(at18([]).size).toEqual({ base: "medium", now: "medium", why: [] });
    expect(at18(["giants-might"]).size.now).toBe("large");
    expect(at18(["giants-might", "giants-might-huge"]).size).toEqual({ base: "medium", now: "huge", why: ["Giant's Might: large", "Runic Juggernaut: huge"] });
    expect(at18(["giants-might"]).attacks.find((x) => x.name === "Greatsword")?.attack.notes).toContain("Reach: 10 ft (Runic Juggernaut)");
    expect(pc("class:fighter", 10, "subclass:rune-knight", { toggles: ["giants-might"] }).size.now).toBe("large");
    expect(act(pc("class:fighter", 10, "subclass:rune-knight"), "giants-might").choose).toBeUndefined();
  });
  it("Enlarge/Reduce changes your size on the sheet", () => {
    expect(pc("class:fighter", 5, "subclass:champion", { effects: [{ id: "e", effect: "effect:enlarge-reduce", choice: "Enlarge" }] }).size.now).toBe("large");
    expect(pc("class:fighter", 5, "subclass:champion", { effects: [{ id: "e", effect: "effect:enlarge-reduce", choice: "Reduce" }] }).size.now).toBe("small");
  });
  it("Mote of Potential and Unfailing Inspiration give their own Bardic Inspiration", () => {
    expect(act(pc("class:bard", 3, "subclass:college-of-creation"), "bardic-inspiration").gives?.effect).toBe("other:bardic-inspiration-creation");
    expect(act(pc("class:bard", 6, "subclass:college-of-eloquence"), "bardic-inspiration").gives?.effect).toBe("other:bardic-inspiration-eloquence");
    expect(act(pc("class:bard", 5, "subclass:college-of-eloquence"), "bardic-inspiration").gives?.effect).toBe("other:bardic-inspiration");
    const mote = pc("class:fighter", 5, "subclass:champion", { effects: [{ id: "m", effect: "other:bardic-inspiration-creation", choice: "d8", minutes: 10 }] });
    expect(mote.skills.athletics.suggestions.find((x) => x.label === "Bardic Inspiration")?.apply.dice).toEqual(["2d8kh1"]);
    expect(mote.saves.str.suggestions.find((x) => x.label === "Bardic Inspiration")?.apply.dice).toEqual(["1d8"]);
    const elo = pc("class:fighter", 5, "subclass:champion", { effects: [{ id: "u", effect: "other:bardic-inspiration-eloquence", choice: "d10", minutes: 10 }] });
    expect(elo.effects.find((e) => e.instanceId === "u")).toMatchObject({ usedUp: "Bardic Inspiration", keepIfFails: "Unfailing Inspiration" });
  });
  it("Guardian Spirit: Spirit Totem puts its tag on you, with the healing worked out", () => {
    expect(act(pc("class:druid", 9, "subclass:circle-of-the-shepherd"), "spirit-totem").selfEffect).toBeUndefined();
    expect(act(pc("class:druid", 10, "subclass:circle-of-the-shepherd"), "spirit-totem").selfEffect).toBe("other:spirit-totem-guardian");
    const s = pc("class:druid", 10, "subclass:circle-of-the-shepherd", { effects: [{ id: "g", effect: "other:spirit-totem-guardian", choice: "Bear", minutes: 1 }] });
    expect(s.effects.find((e) => e.instanceId === "g")?.reminders[0]).toMatch(/regains 5 hit points/);
  });
});
