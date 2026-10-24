import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { composeD20, rollComposed } from "@dnd/dice";
import { derive } from "../src/derive.js";
import { buildItems } from "../src/build.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const ch = (race: string, cls: string, level: number, extra: Record<string, unknown> = {}) =>
  Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 12, cha: 10 }, race, classes: [{ class: cls, level, ...extra }], hp: { current: 30, temp: 0 } });

describe("11a: saves and proficiencies the SRD text left out", () => {
  it("Slippery Mind adds Wisdom saves; Diamond Soul all saves and a reroll", () => {
    expect(derive(ch("race:human", "class:rogue", 15, { subclass: "subclass:thief" }), reg).saves.wis.proficient).toBe(true);
    const monk = derive(ch("race:human", "class:monk", 14, { subclass: "subclass:open-hand" }), reg);
    expect(Object.values(monk.saves).every((s) => s.proficient)).toBe(true);
    expect(monk.actions.find((a) => a.id === "diamond-soul-reroll")).toBeTruthy();
  });
  it("Life clerics get heavy armor; Lore bards pick three skills", () => {
    expect(derive(ch("race:human", "class:cleric", 1, { subclass: "subclass:life" }), reg).proficiencies.armor.join(" ")).toMatch(/heavy/i);
    const open = buildItems(ch("race:human", "class:bard", 3, { subclass: "subclass:lore" }), reg).filter((i) => !i.done && i.sourceName.startsWith("Bonus Proficiencies"));
    expect(open.map((i) => [i.label, i.need])).toEqual([["Skills", 3]]);
  });
});

describe("11a: racial traits on rolls", () => {
  it("Halfling Lucky is offered and rerolls a 1", () => {
    const s = derive(ch("race:lightfoot-halfling", "class:fighter", 1), reg);
    const lucky = s.saves.dex.suggestions.find((x) => x.label === "Lucky")!;
    expect(lucky.apply.rerollAtOrBelow).toBe(1);
    expect(s.saves.wis.suggestions.some((x) => x.label === "Brave")).toBe(true);
    const c = composeD20(s.saves.dex, { enabled: ["Lucky"], manual: "none", extra: 0 });
    const r = rollComposed(c, [1, 15]);
    expect(r.result.natural).toBe(15);
    expect(r.result.fumble).toBe(false);
  });
  it("Fey Ancestry, Gnome Cunning and Stonecunning", () => {
    expect(derive(ch("race:high-elf", "class:fighter", 1), reg).saves.wis.suggestions.some((x) => x.label === "Fey Ancestry")).toBe(true);
    expect(derive(ch("race:rock-gnome", "class:fighter", 1), reg).saves.int.suggestions.some((x) => x.label === "Gnome Cunning")).toBe(true);
    const dw = derive(ch("race:hill-dwarf", "class:fighter", 1), reg);
    expect(dw.skills.history.suggestions.find((x) => x.label === "Stonecunning")?.apply.flat).toBe(4);
    expect(derive(ch("race:rock-gnome", "class:fighter", 1), reg).skills.history.suggestions.some((x) => x.label === "Artificer's Lore")).toBe(true);
  });
  it("Evasion notes on Dexterity saves", () => {
    expect(derive(ch("race:human", "class:rogue", 7), reg).saves.dex.notes?.join(" ")).toMatch(/Evasion/);
  });
  it("PHB Dragonborn: resistance, Breath Weapon by level, its DC, a short-rest use", () => {
    const red = (level: number) =>
      derive({ ...ch("race:dragonborn", "class:fighter", level), choices: { "feature:trait-draconic-ancestry": { option: ["feature:trait-draconic-ancestry-red"] } } } as Character, reg);
    const s = red(1);
    expect(s.defenses.resist).toContain("fire");
    const b = s.actions.find((a) => a.id === "breath-weapon-red")!;
    expect(b.roll?.text).toMatch(/2d6/);
    expect(b.dc?.value).toBe(8 + 2 + 2);
    expect(s.resources.find((r) => r.id === "breath-weapon")).toMatchObject({ max: 1, reset: "short" });
    expect(red(6).actions.find((a) => a.id === "breath-weapon-red")!.roll?.text).toMatch(/3d6/);
  });
});
