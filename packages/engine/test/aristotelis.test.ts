import { describe, expect, it } from "vitest";
import { SKILLS, type Skill } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { loadCharacter, tableRegistry } from "./helpers.js";

/**
 * Reference character: Αριστοτέλης, Tiefling Divination Wizard 4.
 * Expected numbers are his sheet, corrected by the DM: the Stone of Good Luck
 * is attuned (+1 to every check and save), Mage Armor is usually up, and the
 * Infernal Legacy spells are added.
 */
const reg = tableRegistry();
const character = loadCharacter("aristotelis");
const sheet = derive(character, reg);

describe("Αριστοτέλης (Wizard 4)", () => {
  it("has no data warnings", () => {
    expect(sheet.warnings).toEqual([]);
  });

  it("ability scores: Tiefling and Fey Touched bonuses", () => {
    const scores = Object.fromEntries(Object.entries(sheet.abilities).map(([k, v]) => [k, v.score.total]));
    expect(scores).toEqual({ str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 });
    expect(sheet.abilities.int.score.parts.map((p) => p.label)).toEqual(["Base score", "Tiefling", "Fey Touched"]);
  });

  it("saving throws include the Stone of Good Luck", () => {
    const totals = Object.fromEntries(Object.entries(sheet.saves).map(([k, v]) => [k, v.total]));
    expect(totals).toEqual({ str: 0, dex: 3, con: 3, int: 7, wis: 4, cha: 1 });
  });

  it("all skills are the sheet values +1", () => {
    const sheetValues: Record<Skill, number> = {
      acrobatics: 2,
      animalHandling: 1,
      arcana: 6,
      athletics: -1,
      deception: 0,
      history: 6,
      insight: 3,
      intimidation: 0,
      investigation: 6,
      medicine: 1,
      nature: 4,
      perception: 1,
      performance: 0,
      persuasion: 0,
      religion: 4,
      sleightOfHand: 2,
      stealth: 2,
      survival: 1,
    };
    const totals = Object.fromEntries(SKILLS.map((s) => [s, sheet.skills[s].total]));
    expect(totals).toEqual(Object.fromEntries(SKILLS.map((s) => [s, sheetValues[s] + 1])));
    expect(sheet.skills.arcana.parts.at(-1)).toEqual({ label: "Stone of Good Luck", value: 1 });
  });

  it("passive Perception 12 and initiative +3 (initiative is a Dexterity check)", () => {
    expect(sheet.passives.perception.total).toBe(12);
    expect(sheet.initiative.total).toBe(3);
  });

  it("AC 15 with Mage Armor up, 12 without", () => {
    expect(sheet.ac.total).toBe(15);
    expect(sheet.ac.parts.map((p) => p.label)).toEqual(["Mage Armor", "Dexterity modifier"]);
    const noArmor = derive({ ...character, toggles: [] }, reg);
    expect(noArmor.ac.total).toBe(12);
  });

  it("HP, speed, fire resistance, darkvision", () => {
    expect(sheet.hpMax.total).toBe(26);
    expect(sheet.speed.total).toBe(30);
    expect(sheet.defenses.resist).toEqual(["fire"]);
    expect(sheet.senses).toEqual({ darkvision: 60 });
  });

  it("dagger +4, 1d4+2, also thrown", () => {
    const melee = sheet.attacks.find((a) => a.name === "Dagger")!;
    const thrown = sheet.attacks.find((a) => a.name === "Dagger (thrown)")!;
    expect([melee.attack.total, melee.damage.bonus.total]).toEqual([4, 2]);
    expect([thrown.attack.total, thrown.range]).toEqual([4, [20, 60]]);
  });

  it("spellcasting: wizard and Fey Touched DC 14 / +6, Infernal Legacy DC 10 / +2", () => {
    expect(sheet.spellcasting.map((s) => [s.label, s.saveDc.total, s.attack.total])).toEqual([
      ["Wizard", 14, 6],
      ["Infernal Legacy", 10, 2],
      ["Fey Touched", 14, 6],
    ]);
    expect(sheet.spellSlots).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 3 },
    ]);
  });

  it("resources, with Arcane Recovery already used", () => {
    expect(sheet.resources.map((r) => [r.name, r.remaining, r.max])).toEqual([
      ["Infernal Legacy: Hellish Rebuke", 1, 1],
      ["Arcane Recovery", 0, 1],
      ["Portent rolls", 2, 2],
      ["Fey Touched: Misty Step", 1, 1],
      ["Fey Touched: 1st-level spell", 1, 1],
      ["Φυλαχτό του Ηλιακού Φωτός", 1, 1],
    ]);
  });
});
