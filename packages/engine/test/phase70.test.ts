import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { evalExpr } from "../src/expr.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const sheet = (classes: { class: string; level: number; subclass?: string }[], extra: Record<string, unknown> = {}) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 16, dex: 14, con: 14, int: 18, wis: 12, cha: 10 }, race: "race:human", classes, hp: { current: 30, temp: 0 }, ...extra }), reg);
const on = (effect: string, castLevel?: number, more: Record<string, unknown> = {}) => ({ effects: [{ id: "e", effect, rounds: 10, ...(castLevel ? { castLevel } : {}), ...more }] });
const sword = { inventory: [{ id: "w", item: "item:longsword", quantity: 1, equipped: true, attuned: false }] };
const ctx = (level: number, slotLevel?: number) => ({ pb: 2, mods: { str: 0, dex: 0, con: 0, int: 4, wis: 0, cha: 0 }, level, classLevels: {}, spellMod: 4, ...(slotLevel ? { slotLevel } : {}) });

describe("13d: new value terms", () => {
  it("cantrip dice by character level, slot tables, twice the slot, the spellcasting modifier", () => {
    expect(evalExpr("cantripd8", ctx(4))).toEqual([{ kind: "dice", dice: "1d8" }]);
    expect(evalExpr("cantripd8", ctx(11))).toEqual([{ kind: "dice", dice: "3d8" }]);
    expect(evalExpr("cantrip-1d8", ctx(4))).toEqual([{ kind: "flat", value: 0 }]);
    expect(evalExpr("cantrip-1d8", ctx(17))).toEqual([{ kind: "dice", dice: "3d8" }]);
    expect(evalExpr("bySlot[2:2d8;3:3d8;5:4d8;7:5d8]", ctx(5, 4))).toEqual([{ kind: "dice", dice: "3d8" }]);
    expect(evalExpr("2xslotLevel-8d6+spellmod", ctx(9, 6))).toEqual([{ kind: "dice", dice: "4d6" }, { kind: "flat", value: 4, label: "Spellcasting modifier" }]);
    expect(evalExpr("slotLevel+1d8", ctx(9, 3))).toEqual([{ kind: "dice", dice: "4d8" }]);
  });
});

describe("13d: SRD spells", () => {
  it("True Strike: advantage ticked on the next attack, used up with it", () => {
    const a = sheet([{ class: "class:wizard", level: 1 }], { ...sword, ...on("effect:true-strike") }).attacks.find((x) => x.name === "Longsword")!;
    expect(a.attack.suggestions.find((x) => x.label === "True Strike")).toMatchObject({ apply: { mode: "advantage" }, preset: "always", endsEffect: "e" });
  });
  it("Arcane Hand: its fist rolls the spell's attack, the crush grows with the slot", () => {
    const s = sheet([{ class: "class:wizard", level: 13 }], on("effect:arcane-hand", 6));
    const crush = s.actions.find((a) => a.id === "arcane-hand-crush");
    expect(crush?.roll?.text ?? JSON.stringify(crush?.roll)).toMatch(/4d6/);
    expect(s.actions.find((a) => a.id === "arcane-hand-fist")?.rollsSpell).toBe("spell:arcane-hand");
    expect(reg.get("spell:arcane-hand", "spell").damage?.atSlot?.["7"]).toBe("8d8");
  });
  it("Arcane Sword: a bonus action attack each turn", () => {
    expect(sheet([{ class: "class:wizard", level: 13 }], on("effect:arcane-sword")).actions.find((a) => a.id === "arcane-sword-attack")).toMatchObject({ economy: "bonus", rollsSpell: "spell:arcane-sword" });
  });
  it("Time Stop: a counter of turns, rolled when cast", () => {
    expect(reg.get("effect:time-stop", "effect").counter).toMatchObject({ label: "Turns", startRoll: "1d4+1", endsAtZero: true });
  });
  it("Animate Objects: five sizes, ten objects at 5th", () => {
    const sum = reg.list("summon").find((x) => x.spell === "spell:animate-objects")!;
    expect(sum.creatures).toHaveLength(5);
    expect(sum.count?.["7"]).toBe(14);
    expect(reg.get("creature:animated-object-medium", "creature")).toMatchObject({ hp: 40, ac: 13 });
  });
});

describe("13d: book spells' mechanics", () => {
  it("Shadow Blade: a weapon while it lasts, its dice by the slot", () => {
    const at2 = sheet([{ class: "class:wizard", level: 5 }], on("effect:shadow-blade", 2)).attacks.find((a) => a.name === "Shadow Blade" && a.mode === "melee")!;
    expect([at2.damage.dice, at2.damage.type, at2.ability]).toEqual(["2d8", "psychic", "str"]);
    expect(sheet([{ class: "class:wizard", level: 9 }], on("effect:shadow-blade", 5)).attacks.find((a) => a.name === "Shadow Blade")!.damage.dice).toBe("4d8");
    expect(at2.attack.suggestions.some((x) => x.label === "Shadow Blade")).toBe(true);
    expect(sheet([{ class: "class:wizard", level: 5 }]).attacks.some((a) => a.name === "Shadow Blade")).toBe(false);
  });
  it("Booming Blade and Green-Flame Blade: riders by character level, and their follow-ups", () => {
    const low = sheet([{ class: "class:wizard", level: 4 }], { ...sword, ...on("effect:booming-blade") });
    expect(low.actions.find((a) => a.id === "booming-blade-moved")?.roll?.text ?? "").toMatch(/1d8/);
    const high = sheet([{ class: "class:wizard", level: 11 }], { ...sword, ...on("effect:green-flame-blade") });
    expect(high.attacks.find((a) => a.name === "Longsword")!.damage.bonus.suggestions.find((x) => x.label === "Green-Flame Blade")).toMatchObject({ apply: { dice: ["2d8"], damageType: "fire" } });
    expect(high.actions.find((a) => a.id === "green-flame-blade-leap")?.roll?.text ?? "").toMatch(/2d8/);
  });
  it("Spirit Shroud and Elemental Weapon: the chosen type, dice by the slot", () => {
    const s = sheet([{ class: "class:wizard", level: 9 }], { ...sword, ...on("effect:spirit-shroud", 5, { choice: "cold" }) });
    expect(s.attacks.find((a) => a.name === "Longsword")!.damage.bonus.suggestions.find((x) => x.label === "Spirit Shroud")).toMatchObject({ apply: { dice: ["2d8"], damageType: "cold" } });
    const ew = sheet([{ class: "class:paladin", level: 13 }], { ...sword, ...on("effect:elemental-weapon", 5, { choice: "fire" }) }).attacks.find((a) => a.name === "Longsword")!;
    expect(ew.attack.suggestions.find((x) => x.label === "Elemental Weapon")).toMatchObject({ apply: { flat: 2 } });
    expect(ew.damage.bonus.suggestions.find((x) => x.label === "Elemental Weapon")).toMatchObject({ apply: { dice: ["2d4"], damageType: "fire" } });
  });
  it("defenses and buffs: Investitures, Otherworldly Guise, Intellect Fortress, Gift of Alacrity", () => {
    const fire = sheet([{ class: "class:wizard", level: 11 }], on("effect:investiture-of-flame"));
    expect([fire.defenses.immune.includes("fire"), fire.defenses.resist.includes("cold")]).toEqual([true, true]);
    const guise = sheet([{ class: "class:wizard", level: 11 }], on("effect:tashas-otherworldly-guise", undefined, { choice: "Lower Planes" }));
    expect(guise.defenses.immune).toEqual(expect.arrayContaining(["fire", "poison", "charmed"]));
    expect(guise.defenses.immune).not.toContain("radiant");
    const fort = sheet([{ class: "class:wizard", level: 5 }], on("effect:intellect-fortress"));
    expect([fort.defenses.resist.includes("psychic"), fort.saves.wis.advantage.length > 0]).toEqual([true, true]);
    expect(sheet([{ class: "class:wizard", level: 1 }], on("effect:gift-of-alacrity")).initiative.dice.map((d) => d.dice)).toContain("1d8");
  });
});
