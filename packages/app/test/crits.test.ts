import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { composeDamage, formatFormula, physicalDamageTotal, rollComposed, seededRng } from "@dnd/dice";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";
import { damageFor } from "../src/crit.js";

const reg = tableRegistry();
const hitOf = (a: { damage: { dice: string; type: string; bonus: Parameters<typeof composeDamage>[2] } }) => composeDamage(a.damage.dice, a.damage.type, a.damage.bonus);
const sevens = (c: { sources: string[] }) => c.sources.filter((s) => /^Vicious/.test(s)).length;

describe("Vicious: +7 on any critical hit (this table's ruling), once", () => {
  const bow = derive(loadCharacter("beren"), reg).attacks.find((a) => a.name === "Vicious Longbow")!;

  it("a normal hit has no +7; a critical hit has exactly +7, apart from the doubled dice", () => {
    expect(bow.damage.onCrit).toEqual([{ label: "Vicious (critical hit)", value: 7 }]);
    const hit = hitOf(bow);
    expect(sevens(damageFor(hit, bow, false))).toBe(0);
    const crit = damageFor(hit, bow, true);
    expect(sevens(crit)).toBe(1);
    expect(formatFormula(crit.terms)).toBe("2d8[piercing]+3+7");
  });

  it("switching between hit and critical hit back and forth never adds it twice", () => {
    const hit = hitOf(bow);
    let c = hit;
    for (const crit of [true, false, true, true, false, true]) c = damageFor(hit, bow, crit);
    expect(sevens(c)).toBe(1);
    expect(formatFormula(c.terms)).toBe("2d8[piercing]+3+7");
    expect(sevens(damageFor(hit, bow, false))).toBe(0);
  });

  it("the +7 counts in both dice modes: app rolls and a typed dice total", () => {
    const crit = damageFor(hitOf(bow), bow, true);
    const r = rollComposed(crit, undefined, seededRng(4));
    const dice = r.result.terms.filter((t) => t.term.kind === "dice").reduce((n, t) => n + t.total, 0);
    expect(r.result.total).toBe(dice + 3 + 7);
    // My dice: the player types the two d8s' total (9); the modifiers and the +7 are added.
    expect(physicalDamageTotal(crit, 9)).toBe(9 + 3 + 7);
  });
});

describe("Savage Attacks: one more weapon die on a melee weapon critical hit", () => {
  // Strength 16, +2 as a Half-Orc: 18, so +4 on damage.
  const orc = (cls = "class:fighter", level = 1) => {
    const c = newCharacter({ id: "o", name: "O", race: "race:half-orc", class: cls, abilities: { str: 16, dex: 14, con: 14, int: 8, wis: 10, cha: 8 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level };
    c.inventory.push({ id: "ax", item: "item:greataxe", quantity: 1, equipped: true, attuned: false } as never);
    c.inventory.push({ id: "hx", item: "item:handaxe", quantity: 1, equipped: false, attuned: false } as never);
    c.inventory.push({ id: "lb", item: "item:longbow", quantity: 1, equipped: false, attuned: false } as never);
    return derive(c, reg).attacks;
  };

  it("a melee weapon crit adds one weapon die to the crit's extra dice", () => {
    const ax = orc().find((a) => a.name === "Greataxe")!;
    expect(ax.damage.critExtraDice).toEqual([{ label: "Savage Attacks", value: 1 }]);
    expect(formatFormula(damageFor(hitOf(ax), ax, true).terms)).toBe("3d12[slashing]+4");
    // Not on a plain hit.
    expect(formatFormula(damageFor(hitOf(ax), ax, false).terms)).toBe("1d12[slashing]+4");
  });

  it("not on a ranged weapon attack, nor a melee weapon thrown at range", () => {
    const atks = orc();
    expect(atks.find((a) => a.name === "Longbow")!.damage.critExtraDice).toEqual([]);
    expect(atks.find((a) => a.name === "Handaxe (thrown)")!.damage.critExtraDice).toEqual([]);
    expect(atks.find((a) => a.name === "Handaxe")!.damage.critExtraDice).toEqual([{ label: "Savage Attacks", value: 1 }]);
  });

  it("adds up with Brutal Critical, and stays apart from flat crit damage", () => {
    const ax = orc("class:barbarian", 9).find((a) => a.name === "Greataxe")!;
    expect(ax.damage.critExtraDice.map((p) => p.label).sort()).toEqual(["Brutal Critical", "Savage Attacks"]);
    expect(formatFormula(damageFor(hitOf(ax), ax, true).terms)).toBe("4d12[slashing]+4");
  });

  it("other races don't get it", () => {
    const c = newCharacter({ id: "h", name: "H", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 14, con: 14, int: 8, wis: 10, cha: 8 } }, reg);
    c.inventory.push({ id: "ax", item: "item:greataxe", quantity: 1, equipped: true, attuned: false } as never);
    expect(derive(c, reg).attacks.find((a) => a.name === "Greataxe")!.damage.critExtraDice).toEqual([]);
  });
});
