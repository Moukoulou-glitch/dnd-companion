import { describe, expect, it } from "vitest";
import { SKILLS, type Skill } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { loadCharacter, tableRegistry } from "./helpers.js";

/**
 * Reference character: Αγακλής, Variant Human Ancestral Guardian Barbarian 9.
 * Expected numbers are his sheet, corrected by the DM: Danger Sense stays,
 * Survival Instincts is removed, Athlete (Remastered) is table homebrew.
 */
const reg = tableRegistry();
const character = loadCharacter("agaklis");
const sheet = derive(character, reg);
const raging = derive({ ...character, toggles: ["raging"] }, reg);
const attack = (s: typeof sheet, name: string) => {
  const a = s.attacks.find((x) => x.name === name);
  if (!a) throw new Error(`No attack "${name}"; have ${s.attacks.map((x) => x.name).join(", ")}`);
  return a;
};

describe("Αγακλής (Barbarian 9)", () => {
  it("has no data warnings", () => {
    expect(sheet.warnings).toEqual([]);
  });

  it("saving throws", () => {
    const totals = Object.fromEntries(Object.entries(sheet.saves).map(([k, v]) => [k, v.total]));
    expect(totals).toEqual({ str: 8, dex: 2, con: 7, int: -1, wis: 0, cha: 0 });
  });

  it("all skills, Athletics +12 from Athlete (Remastered) expertise", () => {
    const expected: Record<Skill, number> = {
      acrobatics: 2,
      animalHandling: 4,
      arcana: -1,
      athletics: 12,
      deception: 0,
      history: -1,
      insight: 0,
      intimidation: 0,
      investigation: -1,
      medicine: 0,
      nature: 3,
      perception: 0,
      performance: 0,
      persuasion: 4,
      religion: -1,
      sleightOfHand: 2,
      stealth: 2,
      survival: 4,
    };
    expect(Object.fromEntries(SKILLS.map((s) => [s, sheet.skills[s].total]))).toEqual(expected);
    expect(sheet.passives.perception.total).toBe(10);
  });

  it("Unarmored Defense AC 15; Stefanor's Shield adds 2 when equipped", () => {
    expect(sheet.ac.total).toBe(15);
    expect(sheet.ac.parts.map((p) => p.label)).toEqual(["Unarmored Defense", "Dexterity modifier", "Constitution modifier"]);
    const withShield = derive(
      { ...character, inventory: character.inventory.map((i) => (i.id === "i5" ? { ...i, equipped: true } : i)) },
      reg,
    );
    expect(withShield.ac.total).toBe(17);
  });

  it("initiative +2 with Feral Instinct advantage, speed 40, HP 95", () => {
    expect(sheet.initiative.total).toBe(2);
    expect(sheet.initiative.advantage).toEqual(["Feral Instinct"]);
    expect(sheet.speed.total).toBe(40);
    expect(sheet.hpMax.total).toBe(95);
  });

  it("Danger Sense is offered on Dexterity saves", () => {
    expect(sheet.saves.dex.suggestions.map((s) => s.label)).toEqual(["Danger Sense"]);
  });

  it("weapons all +8 / +4", () => {
    for (const name of ["Flame Tongue Shortsword", "Warhammer", "Handaxe", "Handaxe (thrown)", "Javelin", "Javelin (thrown)"]) {
      expect([name, attack(sheet, name).attack.total, attack(sheet, name).damage.bonus.total]).toEqual([name, 8, 4]);
    }
    expect(attack(sheet, "Warhammer").damage.versatileDice).toBe("1d10");
  });

  it("Brutal Critical adds one die on melee crits, not on thrown attacks", () => {
    expect(attack(sheet, "Warhammer").damage.critExtraDice).toEqual([{ label: "Brutal Critical", value: 1 }]);
    expect(attack(sheet, "Javelin (thrown)").damage.critExtraDice).toEqual([]);
  });

  it("Rage resource: 4 per long rest at 9th level", () => {
    expect(sheet.resources).toContainEqual(expect.objectContaining({ name: "Rage", max: 4, reset: "long" }));
  });

  it("while raging: +3 melee damage, STR advantage, B/P/S resistance", () => {
    expect(attack(raging, "Warhammer").damage.bonus.total).toBe(7);
    expect(attack(raging, "Warhammer").damage.bonus.parts.at(-1)).toEqual({ label: "Rage", value: 3 });
    expect(raging.skills.athletics.advantage).toEqual(["Rage"]);
    expect(raging.saves.str.advantage).toEqual(["Rage"]);
    expect(raging.defenses.resist.sort()).toEqual(["bludgeoning", "piercing", "slashing"]);
    expect(sheet.defenses.resist).toEqual([]);
  });

  it("Flame Tongue adds 2d6 fire only while lit", () => {
    expect(attack(sheet, "Flame Tongue Shortsword").damage.bonus.dice).toEqual([]);
    const lit = derive({ ...character, toggles: ["flame-tongue-lit"] }, reg);
    expect(attack(lit, "Flame Tongue Shortsword").damage.bonus.dice).toEqual([
      { label: "Flame Tongue (lit)", dice: "2d6", damageType: "fire" },
    ]);
  });
});
