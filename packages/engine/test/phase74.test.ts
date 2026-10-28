import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { buildItems } from "../src/build.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (cls: string, level: number, subclass: string, extra: Record<string, unknown> = {}) =>
  Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 16, cha: 16 }, race: "race:human", classes: [{ class: cls, level, subclass }], hp: { current: 30, temp: 0 }, ...extra });

describe("13f: College of Spirits", () => {
  const bard = (level: number, extra: Record<string, unknown> = {}) => derive(pc("class:bard", level, "subclass:college-of-spirits", extra), reg);
  it("Guiding Whispers: guidance on the bard list, not counted", () => {
    expect(bard(3).spells.some((s) => s.id === "spell:guidance" && s.list.id === "bard")).toBe(true);
  });
  it("Tales from Beyond: a Bardic Inspiration use, the die on the twelve tales", () => {
    const a = bard(5).actions.find((x) => x.id === "tales-from-beyond")!;
    expect([a.cost?.resource, a.roll?.text, a.roll?.table?.length]).toEqual(["bardic-inspiration", "1d8", 12]);
    expect(bard(14).actions.some((x) => x.id === "tales-from-beyond-second")).toBe(true);
    expect(a.note).toMatch(/DC \d+/);
  });
  it("Spiritual Focus: from 6th, 1d6 on a damage spell and on a healing spell", () => {
    const s6 = bard(6, { spells: [{ spell: "spell:dissonant-whispers", list: "bard", prepared: true }, { spell: "spell:cure-wounds", list: "bard", prepared: true }] });
    expect(s6.spells.find((s) => s.id === "spell:dissonant-whispers")?.damageBonus?.suggestions.find((x) => x.label === "Spiritual Focus")?.apply.dice).toEqual(["1d6"]);
    expect(s6.spells.find((s) => s.id === "spell:cure-wounds")?.damageBonus?.suggestions.find((x) => x.label === "Spiritual Focus")?.apply.dice).toEqual(["1d6"]);
    const s5 = bard(5, { spells: [{ spell: "spell:dissonant-whispers", list: "bard", prepared: true }] });
    expect(s5.spells.find((s) => s.id === "spell:dissonant-whispers")?.damageBonus?.suggestions.some((x) => x.label === "Spiritual Focus")).toBe(false);
  });
  it("Spirit Session: a divination or necromancy spell to pick, once per long rest", () => {
    const c = pc("class:bard", 6, "subclass:college-of-spirits");
    const item = buildItems(c, reg).find((i) => /Spirit Session/.test(i.label));
    expect(item?.choice?.spells?.schools).toEqual(["divination", "necromancy"]);
    expect(derive(pc("class:bard", 6, "subclass:college-of-spirits", { choices: { "feature:college-of-spirits-spirit-session": { spell: ["spell:speak-with-dead"] } } }), reg).spells.some((s) => s.id === "spell:speak-with-dead")).toBe(true);
  });
});

describe("13f: Way of the Ascendant Dragon", () => {
  const monk = (level: number, extra: Record<string, unknown> = {}) => derive(pc("class:monk", level, "subclass:way-of-the-ascendant-dragon", extra), reg);
  it("Draconic Strike: the unarmed strike's damage type can change", () => {
    const u = monk(3).attacks.find((a) => a.attackId === "martial-arts")!;
    expect(u.typeChoices).toEqual([{ label: "Draconic Strike", options: ["bludgeoning", "acid", "cold", "fire", "lightning", "poison"] }]);
  });
  it("Breath of the Dragon: two Martial Arts dice (three from 11th), proficiency-bonus uses, then 2 ki", () => {
    expect(monk(3).actions.find((a) => a.id === "breath-of-the-dragon")?.roll?.text).toBe("2d4");
    expect(monk(5).actions.find((a) => a.id === "breath-of-the-dragon")?.roll?.text).toBe("2d6");
    expect(monk(11).actions.find((a) => a.id === "breath-of-the-dragon")?.roll?.text).toBe("3d8");
    expect(monk(5).resources.find((r) => r.id === "breath-of-the-dragon")?.max).toBe(3);
    expect(monk(5).actions.find((a) => a.id === "breath-of-the-dragon-ki")?.cost).toMatchObject({ resource: "ki", amount: 2 });
    expect(monk(17).actions.find((a) => a.id === "breath-of-the-dragon-augmented")?.roll?.text).toBe("4d10");
    expect(monk(16).actions.some((a) => a.id === "breath-of-the-dragon-augmented")).toBe(false);
  });
  it("Wings Unfurled and Aspect of the Wyrm: flying at walking speed; the aura's resistance", () => {
    const w = monk(6, { toggles: ["wings-unfurled"] });
    expect(w.speeds.find((s) => s.mode === "fly")?.total.total).toBe(w.speed.total);
    expect(monk(11, { toggles: ["wyrm-resist-fire"] }).defenses.resist).toContain("fire");
    expect(monk(17).senses.blindsight).toBe(10);
  });
});
