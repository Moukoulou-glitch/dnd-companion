import { describe, expect, it } from "vitest";
import { Character, type CreatureDef, type CustomCompanion } from "@dnd/schema";
import { companionFromCreature, customCompanionId, derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { applyOperation } from "../src/apply.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_801_000_000_000;
const make = () => newCharacter({ id: "x", name: "X", race: "race:human", class: "class:fighter", abilities: { str: 15, dex: 14, con: 14, int: 10, wis: 12, cha: 8 } }, reg);
const log = () => new CharacterLog(make(), reg, new HybridClock("t", () => (t += 1000)), "player");

const dog: CustomCompanion = {
  id: "d1",
  name: "Argos",
  kind: "Pet",
  size: "Medium",
  type: "beast",
  ac: 12,
  hpMax: 9,
  speed: "40 ft.",
  abilities: { str: 13, dex: 14, con: 12, int: 3, wis: 12, cha: 7 },
  saves: { dex: 4 },
  traits: [{ name: "Keen Smell", summary: "Advantage on Perception checks that rely on smell." }],
  attacks: [{ name: "Bite", kind: "melee", toHit: 3, reach: "5 ft.", damage: "1d6", damageBonus: 1, damageType: "piercing", note: "DC 11 Strength save or prone." }],
  notes: "Found him in **Myrtos**.",
};
const comp = (c: Character) => derive(c, reg).companions.find((x) => x.id === customCompanionId("d1"));

describe("Companion Builder", () => {
  it("a companion you make joins your companions with its numbers worked out", () => {
    const l = log();
    l.record("setCustomCompanion", { companion: dog });
    const k = comp(l.character)!;
    expect(k).toMatchObject({ name: "Argos", custom: { id: "d1", kind: "Pet", notes: dog.notes } });
    expect(k.form).toMatchObject({ name: "Pet", size: "Medium", type: "beast", speed: "40 ft.", hp: { current: 9, temp: 0 } });
    expect(k.form!.ac.total).toBe(12);
    expect(k.form!.hpMax).toEqual({ total: 9, parts: [{ label: "Base", value: 9 }] });
    expect(k.form!.attacks[0]).toMatchObject({ name: "Bite", mode: "melee", attack: { total: 3 }, damage: { dice: "1d6", type: "piercing", bonus: { total: 1 } }, note: "DC 11 Strength save or prone." });
    // Saves: the stat block's own where it gives one, the modifier otherwise.
    expect(k.form!.abilities.dex.save.total).toBe(4);
    expect(k.form!.abilities.str.save.total).toBe(1);
    expect(k.form!.abilities.dex.check.total).toBe(2);
  });

  it("HP: damage and healing reach it, a long rest brings it back, a lower maximum lowers it", () => {
    const l = log();
    l.record("setCustomCompanion", { companion: dog });
    const id = customCompanionId("d1");
    const mine = l.character.hp?.current;
    l.record("damage", { amount: 6, companion: id });
    expect(comp(l.character)!.form!.hp.current).toBe(3);
    l.record("heal", { amount: 2, companion: id });
    expect(comp(l.character)!.form!.hp.current).toBe(5);
    // The character's own HP is untouched.
    expect(l.character.hp?.current).toBe(mine);
    l.record("setCustomCompanion", { companion: { ...dog, hpMax: 4 } });
    expect(comp(l.character)!.form!.hp.current).toBe(4);
    l.record("damage", { amount: 3, companion: id });
    l.record("rest", { kind: "long" });
    expect(comp(l.character)!.form!.hp.current).toBe(4);
  });

  it("it can Dodge like any companion; deleting it forgets its HP and tags; undo brings it back; it survives a reload", () => {
    const l = log();
    l.record("setCustomCompanion", { companion: dog });
    const id = customCompanionId("d1");
    l.record("companionAction", { companion: id, action: "common-dodge" });
    expect(comp(l.character)!.states.map((s) => s.name)).toContain("Dodge");
    l.record("damage", { amount: 2, companion: id });
    const replayed = l.operations.reduce((c, op) => applyOperation(c, op, reg).character, l.base);
    expect(comp(replayed)!.form!.hp.current).toBe(7);
    expect(comp(Character.parse(JSON.parse(JSON.stringify(l.character))))!.form!.hp.current).toBe(7);
    l.record("removeCustomCompanion", { id: "d1" });
    expect(comp(l.character)).toBeUndefined();
    expect(l.character.companions[id]).toBeUndefined();
    l.undo();
    expect(comp(l.character)!.form!.hp.current).toBe(7);
  });

  it("starting from a creature copies its stat block: numbers, traits, attacks, and what else a hit does", () => {
    const mastiff = reg.find("creature:mastiff", "creature") as CreatureDef;
    const c = companionFromCreature(mastiff);
    expect(c).toMatchObject({ from: "creature:mastiff", size: "Medium", type: "beast", ac: 12, hpMax: 5, speed: "40 ft.", abilities: mastiff.abilities });
    expect(c.traits[0]!.name).toBe("Keen Hearing and Smell");
    expect(c.attacks[0]).toMatchObject({ name: "Bite", toHit: 3, damage: "1d6", damageBonus: 1, damageType: "piercing" });
    expect(c.attacks[0]!.note).toMatch(/Strength saving throw or be knocked prone/);
    // A mount with several speeds.
    const horse = reg.find("creature:riding-horse", "creature") as CreatureDef | undefined;
    if (horse) expect(companionFromCreature(horse).speed).toBe("60 ft.");
  });

  it("feature companions are unchanged, and a character saved before has none of its own", () => {
    const old = JSON.parse(JSON.stringify(make()));
    delete old.customCompanions;
    expect(Character.parse(old).customCompanions).toEqual([]);
    expect(derive(Character.parse(old), reg).companions).toEqual([]);
  });
});
