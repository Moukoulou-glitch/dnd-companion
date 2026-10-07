import { describe, expect, it } from "vitest";
import { SKILLS, type Skill } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { explain } from "../src/breakdown.js";
import { loadCharacter, tableRegistry } from "./helpers.js";

/**
 * Reference character: Μπέρεν, Eladrin Beast Master Ranger 4.
 * Every expected number below is copied from his paper sheet; the engine
 * must reproduce it from base values and content alone.
 */
const sheet = derive(loadCharacter("beren"), tableRegistry());

describe("Μπέρεν (Ranger 4) matches his sheet", () => {
  it("has no data warnings", () => {
    expect(sheet.warnings).toEqual([]);
  });

  it("level and proficiency bonus", () => {
    expect(sheet.level).toBe(4);
    expect(sheet.proficiencyBonus).toBe(2);
  });

  it("ability scores and modifiers, racial bonuses included", () => {
    const scores = Object.fromEntries(Object.entries(sheet.abilities).map(([k, v]) => [k, [v.score.total, v.modifier]]));
    expect(scores).toEqual({
      str: [10, 0],
      dex: [16, 3],
      con: [14, 2],
      int: [10, 0],
      wis: [16, 3],
      cha: [8, -1],
    });
    expect(sheet.abilities.dex.score.parts).toContainEqual({ label: "Eladrin", value: 2 });
  });

  it("saving throws", () => {
    const totals = Object.fromEntries(Object.entries(sheet.saves).map(([k, v]) => [k, v.total]));
    expect(totals).toEqual({ str: 2, dex: 5, con: 2, int: 0, wis: 3, cha: -1 });
  });

  it("Fey Ancestry is offered on saves, not applied", () => {
    expect(sheet.saves.wis.advantage).toEqual([]);
    expect(sheet.saves.wis.suggestions).toContainEqual({
      label: "Fey Ancestry",
      effect: "advantage",
      reason: "against being charmed",
      apply: { flat: 0, dice: [], mode: "advantage" },
    });
  });

  it("all 18 skills", () => {
    const expected: Record<Skill, number> = {
      acrobatics: 5,
      animalHandling: 3,
      arcana: 0,
      athletics: 0,
      deception: -1,
      history: 2,
      insight: 5,
      intimidation: -1,
      investigation: 0,
      medicine: 5,
      nature: 0,
      perception: 7,
      performance: -1,
      persuasion: -1,
      religion: 0,
      sleightOfHand: 3,
      stealth: 3,
      survival: 5,
    };
    const totals = Object.fromEntries(SKILLS.map((s) => [s, sheet.skills[s].total]));
    expect(totals).toEqual(expected);
  });

  it("Perception shows Canny expertise in its breakdown", () => {
    expect(sheet.skills.perception.proficiency).toBe(2);
    expect(explain(sheet.skills.perception)).toMatchInlineSnapshot(`
      "  +3  Wisdom modifier
        +4  Expertise (2 × proficiency)
      = 7"
    `);
  });

  it("passive Perception", () => {
    expect(sheet.passives.perception.total).toBe(17);
  });

  it("AC, initiative, speed, HP", () => {
    expect(sheet.ac.total).toBe(14);
    expect(sheet.ac.parts).toEqual([
      { label: "Leather Armor", value: 11 },
      { label: "Dexterity modifier", value: 3 },
    ]);
    expect(sheet.initiative.total).toBe(3);
    expect(sheet.speed.total).toBe(30);
    expect(sheet.hpMax.total).toBe(36);
    expect(sheet.hitDice).toEqual([{ die: "d10", total: 4, used: 0 }]);
  });

  it("Vicious Longbow: +7, 1d8+3 piercing, +7 on a natural 20", () => {
    const bow = sheet.attacks.find((a) => a.name === "Vicious Longbow")!;
    expect(bow.attack.total).toBe(7);
    expect(bow.attack.parts.map((p) => p.label)).toEqual(["Dexterity modifier", "Proficiency bonus", "Archery"]);
    expect(bow.damage.dice).toBe("1d8");
    expect(bow.damage.bonus.total).toBe(3);
    expect(bow.damage.type).toBe("piercing");
    expect(bow.damage.onCrit).toEqual([{ label: "Vicious (natural 20)", value: 7 }]);
  });

  it("Shortsword: +5, 1d6+3 (finesse uses DEX, Archery does not apply)", () => {
    const sword = sheet.attacks.find((a) => a.name === "Shortsword")!;
    expect(sword.ability).toBe("dex");
    expect(sword.attack.total).toBe(5);
    expect(sword.damage.bonus.total).toBe(3);
  });

  it("spellcasting: ranger and Magic Initiate both DC 13, +5", () => {
    expect(sheet.spellcasting.map((s) => [s.label, s.saveDc.total, s.attack.total])).toEqual([
      ["Ranger", 13, 5],
      ["Magic Initiate (Cleric)", 13, 5],
    ]);
    expect(sheet.spellSlots).toEqual([{ level: 1, total: 3 }]);
  });

  it("resources", () => {
    expect(sheet.resources.map((r) => [r.name, r.max, r.reset])).toEqual([
      ["Fey Step", 1, "short"],
      ["Favored Foe", 2, "long"],
      ["Primal Awareness: Speak with Animals", 1, "long"],
      ["Magic Initiate: free 1st-level spell", 1, "long"],
    ]);
  });

  it("senses and languages", () => {
    expect(sheet.senses).toEqual({ darkvision: 60 });
    expect(sheet.proficiencies.languages.sort()).toEqual(["Common", "Druidic", "Elvish", "Ignan", "Sylvan"]);
  });
});
