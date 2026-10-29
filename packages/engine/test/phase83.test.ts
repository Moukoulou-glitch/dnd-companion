import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { choiceOptions } from "../src/build.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (race: string, cls: string, level: number, choices: Record<string, Record<string, string[]>> = {}, extra: Record<string, unknown> = {}) =>
  derive(Character.parse({ id: "x", schemaVersion: 1, ruleset: "5e-2014", name: "X", abilities: { str: 14, dex: 14, con: 14, int: 12, wis: 10, cha: 16 }, race, classes: [{ class: cls, level }], choices, hp: { current: 30, temp: 0 }, ...extra }), reg);
const sword = { inventory: [{ id: "s", item: "item:longsword", quantity: 1, equipped: true }] };
const eladrin = (level: number, season: string, cls = "class:fighter") => pc("race:eladrin", cls, level, { "race:eladrin": { season: [season] } }, sword);
const feyStep = (s: ReturnType<typeof derive>) => s.actions.find((a) => a.id === "fey-step")!;

describe("Eladrin seasons (Slumberfall, Nocter, Titanspring, Heammer)", () => {
  it("the season's effect on Fey Step from 3rd level, with its DC (8 + proficiency + Charisma)", () => {
    expect(feyStep(eladrin(2, "Slumberfall")).note).not.toMatch(/charmed/);
    const s = feyStep(eladrin(3, "Slumberfall"));
    expect(s.note).toMatch(/Season: Slumberfall \(autumn\): .*charmed/);
    expect(s.dc?.value).toBe(8 + 2 + 3);
    expect(feyStep(eladrin(3, "Heammer")).note).toMatch(/takes 3 fire damage/);
    expect(feyStep(eladrin(3, "Titanspring")).dc).toBeUndefined();
  });
  it("no season yet: Fey Step works, the choice waits", () => {
    expect(feyStep(pc("race:eladrin", "class:fighter", 5)).note).toBe("Teleport up to 30 ft to an unoccupied space you can see.");
  });
});

describe("heritage features at 10th level (homebrew)", () => {
  it("Unbridled Seasons: only from character level 10; Fey Step as a reaction, 60 ft", () => {
    expect(eladrin(9, "Heammer").actions.some((a) => a.id === "fey-step-reaction")).toBe(false);
    const s = eladrin(10, "Heammer");
    expect(s.actions.find((a) => a.id === "fey-step-reaction")).toMatchObject({ economy: "reaction", cost: { resource: "fey-step" } });
    expect(feyStep(s).note).toMatch(/range is 60 ft/);
  });
  it("Heammer: Beacon of Hope free once per long rest without concentration; +2 fire or radiant on weapons and fire/radiant spells", () => {
    const s = eladrin(10, "Heammer", "class:cleric");
    const beacon = s.spells.find((x) => x.id === "spell:beacon-of-hope" && x.list.id === "unbridled-seasons")!;
    expect(beacon.cast.free).toMatchObject({ remaining: 1, noConcentration: true });
    const sword = s.attacks[0]!;
    const opts = sword.damage.bonus.suggestions.filter((x) => x.label.startsWith("Heammer"));
    expect(opts.map((o) => [o.label, o.preset])).toEqual([["Heammer: +2 fire", "always"], ["Heammer: +2 radiant", undefined]]);
  });
  it("Titanspring: one more Action Surge; Nocter: +4 cold or necrotic", () => {
    expect(eladrin(10, "Titanspring").resources.find((r) => r.id === "action-surge")?.max).toBe(2);
    expect(eladrin(10, "Heammer").resources.find((r) => r.id === "action-surge")?.max).toBe(1);
    expect(eladrin(10, "Nocter").attacks[0]!.damage.bonus.suggestions.some((x) => x.label === "Nocter: +4 necrotic")).toBe(true);
  });
  it("Thinking Stone: wizard spells of 1 action, bonus action or reaction with no concentration; DC 8 + proficiency, attack + proficiency", () => {
    const ch = reg.get("feature:heritage-thinking-stone", "feature").choices![1]!;
    const names = choiceOptions(ch, reg).map((o) => o.label);
    expect(names).toContain("Misty Step");
    expect(names).not.toContain("Invisibility");
    const s = pc("race:rock-gnome", "class:fighter", 10, { "feature:heritage-thinking-stone": { "spells-1": ["spell:magic-missile"] } });
    const sc = s.spellcasting.find((x) => x.id === "thinking-stone")!;
    expect([sc.saveDc.total, sc.attack.total]).toEqual([12, 4]);
    expect(s.spells.find((x) => x.id === "spell:magic-missile")?.cast.extra?.tag).toBe("Thinking Stone: stored, once per long rest");
  });
  it("Human Above All: a feat picked, applied like any other", () => {
    const s = pc("race:variant-human", "class:fighter", 10, { "feature:heritage-human-above-all": { feat: ["feat:alert"] } });
    expect(s.features.some((f) => f.id === "feat:alert")).toBe(true);
    expect(s.initiative.total).toBe(2 + 5);
  });
  it("Adama: an option on d20 rolls that adds both dice, spending a use (proficiency bonus per long rest)", () => {
    const s = pc("race:half-elf", "class:fighter", 10);
    expect(s.resources.find((r) => r.id === "adama")?.max).toBe(4);
    expect(s.saves.dex.suggestions.find((x) => x.label === "Adama")).toMatchObject({ apply: { sumD20: 20 }, spends: { resource: "adama", amount: 1 } });
  });
});
