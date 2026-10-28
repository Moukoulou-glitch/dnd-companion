import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (cls: string, level: number, subclass: string) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 14, cha: 10 }, race: "race:human", classes: [{ class: cls, level, subclass }], hp: { current: 30, temp: 0 } }), reg);

describe("14b: monk features", () => {
  it("Tranquility: Sanctuary after each long rest, DC 8 + Wisdom + proficiency bonus", () => {
    expect(pc("class:monk", 11, "subclass:open-hand").afterLongRest).toEqual([{ effect: "effect:sanctuary", dc: 8 + 2 + 4, from: "Tranquility" }]);
    expect(pc("class:monk", 10, "subclass:open-hand").afterLongRest).toEqual([]);
  });
  it("Physician's Touch ends one of five conditions on you", () => {
    const a = pc("class:monk", 6, "subclass:way-of-mercy").actions.find((x) => x.id === "physicians-touch")!;
    expect(a.endsConditions).toHaveLength(5);
    expect(a.choose?.options).toContain("Poisoned");
    expect(pc("class:monk", 5, "subclass:way-of-mercy").actions.some((x) => x.id === "physicians-touch")).toBe(false);
  });
});

describe("14b: cleric features", () => {
  it("Keeper of Souls: healing typed in, on you or another", () => {
    const a = pc("class:cleric", 17, "subclass:grave-domain").actions.find((x) => x.id === "keeper-of-souls")!;
    expect(a.healEntered).toMatch(/Hit Dice/);
    expect(a.others).toBe(true);
  });
  it("Protective Bond: from 17th level (Expansive Bond) it gives you resistance, and there's still one action", () => {
    const at = (l: number) => pc("class:cleric", l, "subclass:peace-domain").actions.filter((x) => x.id === "protective-bond");
    expect(at(16)).toHaveLength(1);
    expect(at(16)[0]!.selfEffect).toBeUndefined();
    expect(at(17)).toHaveLength(1);
    expect(at(17)[0]!.selfEffect).toBe("effect:protective-bond");
  });
  it("Voice of Authority: a reminder on 1st-level spells and higher", () => {
    expect(pc("class:cleric", 1, "subclass:order-domain").castReminders).toEqual([expect.objectContaining({ from: "Voice of Authority", minLevel: 1 })]);
  });
});
