import { describe, expect, it } from "vitest";
import { SKILLS, type Skill } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { loadCharacter, tableRegistry } from "./helpers.js";

/**
 * Reference character: Ελισσαίος Μόντα, Variant Human Soulknife Rogue 8 /
 * Undead Warlock 1. Expected numbers are his sheet, corrected by the DM:
 * shortbows are +8 (proficient), no Soul Blades at Rogue 8, and by table
 * ruling Sharpshooter works with thrown Psychic Blades.
 */
const sheet = derive(loadCharacter("elissaios"), tableRegistry());
const attack = (name: string) => {
  const a = sheet.attacks.find((x) => x.name === name);
  if (!a) throw new Error(`No attack "${name}"; have ${sheet.attacks.map((x) => x.name).join(", ")}`);
  return a;
};

describe("Ελισσαίος (Rogue 8 / Warlock 1)", () => {
  it("has no data warnings", () => {
    expect(sheet.warnings).toEqual([]);
  });

  it("level 9, proficiency +4", () => {
    expect(sheet.level).toBe(9);
    expect(sheet.proficiencyBonus).toBe(4);
  });

  it("saving throws (rogue saves only; warlock saves don't carry over)", () => {
    const totals = Object.fromEntries(Object.entries(sheet.saves).map(([k, v]) => [k, v.total]));
    expect(totals).toEqual({ str: 0, dex: 8, con: 2, int: 6, wis: 1, cha: 3 });
  });

  it("all skills, four with expertise", () => {
    const expected: Record<Skill, number> = {
      acrobatics: 12,
      animalHandling: 1,
      arcana: 2,
      athletics: 0,
      deception: 7,
      history: 2,
      insight: 1,
      intimidation: 7,
      investigation: 10,
      medicine: 1,
      nature: 2,
      perception: 1,
      performance: 3,
      persuasion: 7,
      religion: 2,
      sleightOfHand: 12,
      stealth: 12,
      survival: 1,
    };
    expect(Object.fromEntries(SKILLS.map((s) => [s, sheet.skills[s].total]))).toEqual(expected);
    expect(SKILLS.filter((s) => sheet.skills[s].proficiency === 2).sort()).toEqual(
      ["acrobatics", "investigation", "sleightOfHand", "stealth"],
    );
  });

  it("AC 15, initiative +4 with advantage from the Shortbow of Warning, speed 30, HP 66", () => {
    expect(sheet.ac.total).toBe(15);
    expect(sheet.initiative.total).toBe(4);
    expect(sheet.initiative.advantage).toEqual(["Weapon of Warning"]);
    expect(sheet.speed.total).toBe(30);
    expect(sheet.hpMax.total).toBe(66);
    expect(sheet.hitDice).toEqual([{ die: "d8", total: 9, used: 0 }]);
    expect(sheet.passives.perception.total).toBe(11);
  });

  it("weapons: all +8, damage +4; shortbows corrected from +4", () => {
    for (const name of ["Dagger", "Dagger (thrown)", "Rapier", "Shortbow", "Shortbow of Warning"]) {
      expect([name, attack(name).attack.total, attack(name).damage.bonus.total]).toEqual([name, 8, 4]);
    }
  });

  it("Psychic Blades: +8 1d6+4 psychic, bonus-action blade 1d4+4", () => {
    const blade = attack("Psychic Blade");
    expect([blade.attack.total, blade.damage.dice, blade.damage.bonus.total, blade.damage.type]).toEqual([8, "1d6", 4, "psychic"]);
    const second = attack("Psychic Blade (bonus action)");
    expect([second.action, second.damage.dice, second.damage.bonus.total]).toEqual(["bonus", "1d4", 4]);
  });

  it("thrown Psychic Blade offers Sharpshooter by table ruling: +3, 1d6+14 when used", () => {
    const thrown = attack("Psychic Blade (thrown)");
    expect(thrown.range).toEqual([60, 60]);
    expect(thrown.attack.suggestions).toContainEqual({ label: "Sharpshooter (-5 / +10)", effect: "-5" });
    expect(thrown.damage.bonus.suggestions).toContainEqual({ label: "Sharpshooter (-5 / +10)", effect: "+10" });
    expect(thrown.attack.total - 5).toBe(3);
    expect(thrown.damage.bonus.total + 10).toBe(14);
    // Melee blades never get Sharpshooter.
    expect(attack("Psychic Blade").attack.suggestions.map((s) => s.label)).not.toContain("Sharpshooter (-5 / +10)");
  });

  it("Sneak Attack is offered as 4d6, never applied automatically", () => {
    const rapier = attack("Rapier");
    expect(rapier.damage.bonus.dice).toEqual([]);
    expect(rapier.damage.bonus.suggestions.find((s) => s.label === "Sneak Attack")?.effect).toBe("+4d6");
  });

  it("Pact Magic: one 1st-level slot, DC 15, +7; no other slots", () => {
    expect(sheet.pactSlots).toEqual({ count: 1, level: 1 });
    expect(sheet.spellSlots).toEqual([]);
    expect(sheet.spellcasting.map((s) => [s.label, s.saveDc.total, s.attack.total])).toEqual([["Warlock (Pact Magic)", 15, 7]]);
  });

  it("resources: Psionic Energy 6 of 8 d8, Form of Dread 3 of 4", () => {
    expect(sheet.resources.map((r) => [r.name, r.remaining, r.max, r.die])).toEqual([
      ["Psionic Energy dice", 6, 8, "d8"],
      ["Form of Dread", 3, 4, undefined],
    ]);
  });
});
