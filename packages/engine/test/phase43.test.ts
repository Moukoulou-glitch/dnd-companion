import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { attackRiders, creatureBlock } from "../src/shapes.js";
import { companionFromCreature } from "../src/companions.js";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();

describe("8d: the rest of a creature's attack damage (invented stat lines)", () => {
  it("always-on extra damage", () => {
    expect(attackRiders("Claw", "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 6 (1d8 + 2) slashing damage plus 7 (2d6) fire damage.")).toEqual([
      { label: "Claw: fire", dice: "2d6", damageType: "fire" },
    ]);
  });
  it("a save for half", () => {
    const [r] = attackRiders("Fang", "Hit: 4 (1d4 + 2) piercing damage, and the target must make a DC 13 Constitution saving throw, taking 9 (2d8) poison damage on a failed save, or half as much damage on a successful one.");
    expect(r).toEqual({ label: "Fang: poison (DC 13 Constitution save)", dice: "2d8", damageType: "poison", save: { dc: 13, ability: "con", half: true } });
  });
  it("a save for none", () => {
    const [r] = attackRiders("Fang", "Hit: 4 (1d4 + 2) piercing damage, and the target must succeed on a DC 12 Constitution saving throw or take 7 (2d6) poison damage.");
    expect(r!.save).toEqual({ dc: 12, ability: "con", half: false });
  });
  it("damage that comes later (a disease, a wound each turn) isn't rolled with the hit", () => {
    expect(attackRiders("Bite", "Hit: 5 (1d6 + 2) piercing damage. If the target is a creature, it must succeed on a DC 12 Constitution saving throw or lose 5 (1d10) hit points at the start of each of its turns.")).toEqual([]);
  });
});

describe("8d: on creatures, summons and companions", () => {
  it("the Imp's sting: piercing, then poison with its save", () => {
    const imp = creatureBlock(reg, "creature:imp")!;
    const sting = imp.attacks.find((a) => a.name.startsWith("Sting"))!;
    expect(sting.damage.type).toBe("piercing");
    expect(sting.damage.bonus.dice).toEqual([expect.objectContaining({ dice: "3d6", damageType: "poison", save: { dc: 11, ability: "con", half: true } })]);
  });
  it("a companion made from a creature gets it too (also ones made before this)", () => {
    const c = Character.parse({
      id: "c", schemaVersion: 1, ruleset: "5e-2014", name: "T", abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, race: "race:human",
      classes: [{ class: "class:fighter", level: 1 }], hp: { current: 10, temp: 0 },
      customCompanions: [{ id: "imp", name: "Imp", kind: "Imp", notes: "", ...companionFromCreature(reg.find("creature:imp", "creature")!) }],
    });
    const comp = derive(c, reg).companions.find((x) => x.name === "Imp")!;
    const sting = comp.form!.attacks.find((a) => a.name.startsWith("Sting"))!;
    expect(sting.damage.bonus.dice.some((d) => d.damageType === "poison" && d.save?.dc === 11)).toBe(true);
  });
});
