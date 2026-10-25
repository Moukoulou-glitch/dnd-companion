import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const sheet = (classes: { class: string; level: number; subclass?: string }[], extra: Record<string, unknown> = {}, abilities = { str: 18, dex: 14, con: 14, int: 10, wis: 16, cha: 14 }) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities, race: "race:human", classes, hp: { current: 30, temp: 0 }, ...extra }), reg);
const res = (s: ReturnType<typeof derive>, id: string) => s.resources.find((r) => r.id === id);

describe("13b: capstones", () => {
  it("Archdruid: Wild Shape never runs out", () => {
    const s = sheet([{ class: "class:druid", level: 20 }], { resourcesUsed: { "wild-shape": 2 } });
    expect([res(s, "wild-shape")?.remaining, res(s, "wild-shape")?.unlimited]).toEqual([2, "Archdruid"]);
    expect(res(sheet([{ class: "class:druid", level: 19 }], { resourcesUsed: { "wild-shape": 2 } }), "wild-shape")?.remaining).toBe(0);
  });
  it("Sorcerous Restoration: 4 sorcery points on a short rest (listed for the rest)", () => {
    expect(sheet([{ class: "class:sorcerer", level: 20 }]).shortRestRegains).toEqual([{ resource: "sorcery-points", amount: 4, from: "Sorcerous Restoration" }]);
    expect(sheet([{ class: "class:sorcerer", level: 19 }]).shortRestRegains).toEqual([]);
  });
  it("Eldritch Master: once per long rest, every Pact slot back", () => {
    const a = sheet([{ class: "class:warlock", level: 20 }]).actions.find((x) => x.id === "eldritch-master");
    expect([a?.restoresPactSlots, a?.cost?.resource]).toEqual([true, "eldritch-master"]);
  });
  it("Foe Slayer: Wisdom on the attack or the damage, once per turn", () => {
    const s = sheet([{ class: "class:ranger", level: 20 }], { inventory: [{ id: "b", item: "item:longbow", quantity: 1, equipped: true, attuned: false }] });
    const bow = s.attacks.find((x) => x.name === "Longbow")!;
    expect(bow.attack.suggestions.find((x) => x.label === "Foe Slayer")).toMatchObject({ apply: { flat: 3 }, oncePerTurn: true });
    expect(bow.damage.bonus.suggestions.find((x) => x.label === "Foe Slayer")).toMatchObject({ apply: { flat: 3 } });
  });
  it("Divine Intervention: a d100 up to 19th level; at 20th it succeeds with no roll", () => {
    const at = (lv: number) => sheet([{ class: "class:cleric", level: lv }]).actions.filter((x) => x.name === "Divine Intervention");
    expect(at(10).map((a) => a.roll?.dice)).toEqual([["1d100"]]);
    expect(at(20).map((a) => [a.id, a.roll])).toEqual([["divine-intervention-sure", undefined]]);
  });
  it("Indomitable Might: a Strength check never totals below the Strength score", () => {
    const s = sheet([{ class: "class:barbarian", level: 18 }]);
    expect(s.skills.athletics.minTotal).toEqual({ value: 19, label: "Indomitable Might" });
    expect(sheet([{ class: "class:barbarian", level: 17 }]).skills.athletics.minTotal).toBeUndefined();
    expect(s.skills.stealth.minTotal).toBeUndefined();
  });
});

describe("13b: immunities", () => {
  it("Mindless Rage: no charm or fright while raging", () => {
    const calm = sheet([{ class: "class:barbarian", level: 6, subclass: "subclass:berserker" }]);
    const raging = sheet([{ class: "class:barbarian", level: 6, subclass: "subclass:berserker" }], { toggles: ["raging"] });
    expect(calm.defenses.immune).not.toContain("charmed");
    expect(raging.defenses.immune).toEqual(expect.arrayContaining(["charmed", "frightened"]));
  });
  it("Purity of Body, Divine Health, Nature's Ward", () => {
    expect(sheet([{ class: "class:monk", level: 10 }]).defenses.immune).toEqual(expect.arrayContaining(["poison", "poisoned", "disease"]));
    expect(sheet([{ class: "class:paladin", level: 3 }]).defenses.immune).toContain("disease");
    expect(sheet([{ class: "class:druid", level: 10, subclass: "subclass:land" }]).defenses.immune).toEqual(expect.arrayContaining(["poison", "disease"]));
  });
  it("Purity of Spirit: always under Protection from Evil and Good, as a tag", () => {
    expect(sheet([{ class: "class:paladin", level: 15, subclass: "subclass:devotion" }]).featureTags.some((t) => /Purity of Spirit/.test(t.name))).toBe(true);
  });
});

describe("13b: uses", () => {
  it("Empty Body: 4 ki, invisible and resistant to all but force while it's on", () => {
    const off = sheet([{ class: "class:monk", level: 18 }]);
    expect(off.actions.find((a) => a.id === "empty-body")?.cost).toMatchObject({ resource: "ki", amount: 4 });
    const on = sheet([{ class: "class:monk", level: 18 }], { toggles: ["empty-body"] });
    expect(on.defenses.resist).toContain("fire");
    expect(on.defenses.resist).not.toContain("force");
    expect(off.spells.some((x) => x.id === "spell:astral-projection")).toBe(true);
  });
  it("Stillness of Mind and Cleansing Touch", () => {
    expect(sheet([{ class: "class:monk", level: 7 }]).actions.find((a) => a.id === "stillness-of-mind")?.endsConditions).toEqual(["condition:charmed", "condition:frightened"]);
    expect(res(sheet([{ class: "class:paladin", level: 14 }], {}, { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 16 }), "cleansing-touch")?.max).toBe(3);
  });
});

describe("13b: Elemental Gift by genie kind", () => {
  const genie = (level: number, kind: string) => sheet([{ class: "class:warlock", level, subclass: "subclass:the-genie" }], { choices: { "feature:genie-expanded-spells": { kind: [`feature:genie-kind-${kind}`] } } });
  it("resistance to the kind's type from warlock 6th", () => {
    expect(genie(6, "efreeti").defenses.resist).toContain("fire");
    expect(genie(6, "marid").defenses.resist).toContain("cold");
    expect(genie(5, "efreeti").defenses.resist).not.toContain("fire");
  });
});
