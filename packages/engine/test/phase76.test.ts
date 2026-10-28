import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (race: string, con: number, extra: Record<string, unknown> = {}) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 14, dex: 14, con, int: 10, wis: 10, cha: 10 }, race, classes: [{ class: "class:fighter", level: 5 }], hp: { current: 30, temp: 0 }, ...extra }), reg);

describe("13g: breath", () => {
  it("1 + Constitution modifier minutes, at least 30 seconds; suffocating lasts the modifier in rounds, at least 1", () => {
    expect(pc("race:human", 14).breath.rounds).toBe(30);
    expect(pc("race:human", 8).breath.rounds).toBe(5);
    expect([pc("race:human", 14).suffocationRounds, pc("race:human", 8).suffocationRounds]).toEqual([2, 1]);
  });
  it("Unending Breath never runs out; Lizardfolk hold 15 minutes; water breathers are told", () => {
    expect(pc("race:air-genasi", 14).breath.rounds).toBeUndefined();
    expect(pc("race:lizardfolk", 14).breath.rounds).toBe(150);
    expect(pc("race:sea-elf", 14).breath.notes[0]).toMatch(/breathe water/);
  });
});

describe("13g: underwater and surprise", () => {
  const items = { inventory: [{ id: "l", item: "item:longsword", quantity: 1, equipped: true, attuned: false }, { id: "s", item: "item:spear", quantity: 1, equipped: false, attuned: false }, { id: "b", item: "item:longbow", quantity: 1, equipped: false, attuned: false }] };
  it("underwater: a longsword and a longbow have disadvantage, a spear doesn't; fire resistance", () => {
    const s = pc("race:human", 14, { ...items, effects: [{ id: "u", effect: "effect:underwater" }] });
    const dis = (n: string) => s.attacks.find((a) => a.name === n && a.mode !== "thrown")!.attack.disadvantage;
    expect(dis("Longsword")).toContain("Underwater (no swimming speed)");
    expect(dis("Spear")).toEqual([]);
    expect(dis("Longbow")).toContain("Underwater");
    expect(s.defenses.resist).toContain("fire");
    // A swimmer uses any melee weapon normally.
    expect(pc("race:sea-elf", 14, { ...items, effects: [{ id: "u", effect: "effect:underwater" }] }).attacks.find((a) => a.name === "Longsword")!.attack.disadvantage).toEqual([]);
  });
  it("Alert: can't be surprised", () => {
    expect(pc("race:human", 14, { feats: [{ feat: "feat:alert", from: "Level 4 Ability Score Improvement" }] }).notSurprised).toBe("Alert");
    expect(pc("race:human", 14).notSurprised).toBeUndefined();
  });
});
