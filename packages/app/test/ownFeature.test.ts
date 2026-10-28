import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "@dnd/engine";
import { ownFeatureOf, ridersOf, usesOf } from "../src/ownFeature";
import { tableRegistry } from "../../engine/test/helpers.js";
const registry = () => reg;
const reg = tableRegistry();

const char = (classes: { class: string; level: number; subclass?: string }[]) =>
  Character.parse({ id: "t", schemaVersion: 1, ruleset: "5e-2014", name: "T", abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 14, cha: 14 }, race: "race:human", classes, hp: { current: 10, temp: 0 } });

describe("8b: a feature's own uses spent from the Play page use the feature", () => {
  it("Second Wind's pips open Second Wind (its 1d10 + level heals)", () => {
    const sheet = derive(char([{ class: "class:fighter", level: 3 }]), registry());
    const a = ownFeatureOf(sheet.actions, "second-wind");
    expect(a?.name).toBe("Second Wind");
    expect(a?.heal).toBeDefined();
  });
  it("a shared pool (superiority dice, used by many maneuvers) stays a die to spend", () => {
    const sheet = derive(char([{ class: "class:fighter", level: 3, subclass: "subclass:battle-master" }]), registry());
    expect(ownFeatureOf(sheet.actions, "superiority-dice")).toBeUndefined();
  });
  it("a feature that doesn't roll (Action Surge) is still spent at once", () => {
    const sheet = derive(char([{ class: "class:fighter", level: 3 }]), registry());
    expect(ownFeatureOf(sheet.actions, "action-surge")).toBeUndefined();
  });
});

describe("13a-2: using a feature from the Play page", () => {
  it("Action Surge's use is Action Surge (its extra action comes with it)", () => {
    const sheet = derive(char([{ class: "class:fighter", level: 2 }]), registry());
    const u = usesOf(sheet.actions, "action-surge");
    expect(u.map((a) => a.name)).toEqual(["Action Surge"]);
    expect(u[0]!.extraAction).toBe(true);
  });
  it("Channel Divinity: every option that spends it, to pick from", () => {
    const sheet = derive(char([{ class: "class:cleric", level: 2, subclass: "subclass:life" }]), registry());
    const names = usesOf(sheet.actions, "channel-divinity").map((a) => a.name);
    expect(names.length).toBeGreaterThan(1);
    expect(names.some((n) => /Turn Undead/.test(n))).toBe(true);
  });
  it("actions anyone can take aren't a feature's uses; a resource nothing spends has none", () => {
    const sheet = derive(char([{ class: "class:fighter", level: 2 }]), registry());
    expect(sheet.actions.filter((a) => a.common).every((a) => !usesOf(sheet.actions, a.cost?.resource ?? "x").includes(a))).toBe(true);
    expect(usesOf(sheet.actions, "nothing-spends-this")).toEqual([]);
  });
});

describe("13a-2: a resource spent by ticking extra damage (Fire Rune: invoke)", () => {
  it("its rider: 2d6 fire, spending the rune's use", () => {
    const c = Character.parse({
      id: "t", schemaVersion: 1, ruleset: "5e-2014", name: "T", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 }, race: "race:human",
      classes: [{ class: "class:fighter", level: 3, subclass: "subclass:rune-knight" }], hp: { current: 10, temp: 0 },
      choices: { "feature:rune-knight-rune-carver": { runes: ["Fire Rune", "Stone Rune"] } },
      inventory: [{ id: "w", item: "item:longsword", quantity: 1, equipped: true, attuned: false }],
    });
    const sheet = derive(c, registry());
    const r = ridersOf(sheet, "rune-fire");
    expect(r).toHaveLength(1);
    expect([r[0]!.apply.dice, r[0]!.apply.damageType, r[0]!.spends?.resource]).toEqual([["2d6"], "fire", "rune-fire"]);
    expect(usesOf(sheet.actions, "rune-fire")).toEqual([]);
    expect(ridersOf(sheet, "nothing")).toEqual([]);
  });
});

describe("Harness Divine Power from the Play page", () => {
  it("its own uses open Harness Divine Power, with the slot to pick", () => {
    const c = char([{ class: "class:cleric", level: 6, subclass: "subclass:life" }]);
    c.slotsUsed = { "1": 2, "2": 1, "3": 1 };
    const sheet = derive(c, registry());
    const u = usesOf(sheet.actions, "harness-divine-power");
    expect(u.map((a) => a.id)).toEqual(["harness-divine-power"]);
    expect(u[0]!.choose?.options).toEqual(["Level 1 slot", "Level 2 slot"]);
  });
});
