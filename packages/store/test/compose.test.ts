import { describe, expect, it } from "vitest";
import { derive } from "../../engine/src/derive.js";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";
import { composeD20, composeDamage, d20Count, diceToRoll, formatFormula, physicalDamageTotal, rollComposed, withCrit } from "../../dice/src/index.js";

const reg = tableRegistry();
const sheetOf = (name: string, toggles: string[] = []) => {
  const c = loadCharacter(name);
  return derive({ ...c, toggles: [...c.toggles, ...toggles] }, reg);
};
const attackOf = (s: ReturnType<typeof derive>, name: string) => s.attacks.find((a) => a.name === name)!;

describe("composing d20 rolls", () => {
  it("Μπέρεν's longbow: 1d20+3+2+2", () => {
    const bow = attackOf(sheetOf("beren"), "Vicious Longbow");
    const c = composeD20(bow.attack);
    expect(formatFormula(c.terms)).toBe("1d20+3+2+2");
    expect(c.sources).toEqual(["d20", "Dexterity modifier", "Proficiency bonus", "Archery"]);
    expect(c.d20Mode).toBe("normal");
  });

  it("a turned-on suggestion joins the roll; one left off doesn't", () => {
    const blade = attackOf(sheetOf("elissaios"), "Psychic Blade (thrown)");
    expect(formatFormula(composeD20(blade.attack).terms)).toBe("1d20+4+4");
    const on = composeD20(blade.attack, { enabled: ["Sharpshooter (-5 / +10)"], manual: "none", extra: 0 });
    expect(formatFormula(on.terms)).toBe("1d20+4+4-5");
  });

  it("advantage from a feature, disadvantage by hand: they cancel", () => {
    const s = sheetOf("agaklis");
    expect(composeD20(s.initiative).d20Mode).toBe("advantage");
    const both = composeD20(s.initiative, { enabled: [], manual: "disadvantage", extra: 0 });
    expect(both.d20Mode).toBe("normal");
    expect(both.advantageFrom).toEqual(["Feral Instinct"]);
    expect(both.disadvantageFrom).toEqual(["Added by hand"]);
    expect(d20Count(both)).toBe(1);
  });

  it("two advantages and one disadvantage still cancel (2014)", () => {
    const s = sheetOf("agaklis", ["raging"]);
    const c = composeD20(s.skills.athletics, { enabled: [], manual: "advantage", extra: 0 });
    expect(c.advantageFrom).toEqual(["Rage", "Added by hand"]);
    expect(composeD20(s.skills.athletics, { enabled: [], manual: "disadvantage", extra: 0 }).d20Mode).toBe("normal");
  });

  it("advantage rolls 2d20 and keeps the higher", () => {
    const s = sheetOf("agaklis");
    const c = composeD20(s.initiative);
    expect(formatFormula(c.terms)).toBe("2d20kh1+2");
    const r = rollComposed(c, [4, 17]);
    expect(r.result.total).toBe(19);
    expect(r.physical).toBe(true);
  });

  it("Stone of Good Luck shows as its own line", () => {
    const c = composeD20(sheetOf("aristotelis").saves.int);
    expect(c.sources).toEqual(["d20", "Intelligence modifier", "Proficiency bonus", "Stone of Good Luck"]);
  });
});

describe("composing damage", () => {
  it("weapon dice carry the weapon's type; Flame Tongue adds typed fire dice", () => {
    const sword = attackOf(sheetOf("agaklis", ["flame-tongue-lit", "raging"]), "Flame Tongue Shortsword");
    const c = composeDamage(sword.damage.dice, sword.damage.type, sword.damage.bonus);
    expect(formatFormula(c.terms)).toBe("1d6[piercing]+4+3+2d6[fire]");
    expect(c.sources).toEqual(["Weapon", "Strength modifier", "Rage", "Flame Tongue (lit)"]);
  });

  it("Sneak Attack is offered, and when on adds 4d6 of the weapon's type", () => {
    const rapier = attackOf(sheetOf("elissaios"), "Rapier");
    const c = composeDamage(rapier.damage.dice, rapier.damage.type, rapier.damage.bonus, { enabled: ["Sneak Attack"], manual: "none", extra: 0 });
    expect(formatFormula(c.terms)).toBe("1d8[piercing]+4+4d6[piercing]");
  });

  it("critical hit doubles every die, then adds crit-only extras", () => {
    const hammer = attackOf(sheetOf("agaklis", ["raging"]), "Warhammer");
    const base = composeDamage(hammer.damage.dice, hammer.damage.type, hammer.damage.bonus);
    const crit = withCrit(base, hammer.damage.critExtraDice.reduce((n, p) => n + p.value, 0), hammer.damage.onCrit);
    expect(formatFormula(crit.terms)).toBe("3d8[bludgeoning]+4+3");

    const bow = attackOf(sheetOf("beren"), "Vicious Longbow");
    const bowCrit = withCrit(composeDamage(bow.damage.dice, bow.damage.type, bow.damage.bonus), 0, bow.damage.onCrit);
    expect(formatFormula(bowCrit.terms)).toBe("2d8[piercing]+3+7");
    expect(bowCrit.sources.at(-1)).toBe("Vicious (natural 20)");
  });

  it("physical damage: one dice total plus the modifiers", () => {
    const sword = attackOf(sheetOf("agaklis", ["flame-tongue-lit"]), "Flame Tongue Shortsword");
    const c = composeDamage(sword.damage.dice, sword.damage.type, sword.damage.bonus);
    expect(diceToRoll(c)).toBe("3d6");
    expect(physicalDamageTotal(c, 11)).toBe(15);
  });
});

describe("damage formulas with a flat part", () => {
  it("Magic Missile at level 2 keeps its +4", () => {
    const c = composeDamage("4d4+4", "force", { total: 0, parts: [], dice: [], advantage: [], disadvantage: [], suggestions: [] });
    expect(formatFormula(c.terms)).toBe("4d4[force]+4");
  });
});
