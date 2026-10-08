import { describe, expect, it } from "vitest";
import { derive, newCharacter, turnWarnings } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 1_700_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
const sheetOf = (log: CharacterLog) => derive(log.character, reg);

const druid = (level: number, subclass?: string) => {
  const c = newCharacter({ id: "d", name: "Yoyo", race: "race:dragonborn", class: "class:druid", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, ...(subclass ? { subclass } : {}) };
  c.hp.current = derive(c, reg).hpMax.total;
  return logOf(c);
};

describe("Wild Shape", () => {
  it("knows the limits by druid level", () => {
    const ws = sheetOf(druid(2)).wildShape!;
    expect(ws).toMatchObject({ maxCr: 0.25, noFly: true, noSwim: true, bonusAction: false, hours: 1 });
    expect(sheetOf(druid(8)).wildShape).toMatchObject({ maxCr: 1, noFly: false, noSwim: false, hours: 4 });
  });

  it("the beast's hit points take damage first; at 0 the rest carries over", () => {
    const log = druid(4);
    const before = log.character.hp.current;
    log.record("transform", { kind: "wildshape", creature: "creature:wolf" });
    let sheet = sheetOf(log);
    expect(sheet.shape).toMatchObject({ name: "Wolf", ac: 13, hp: { current: 11, max: 11 } });
    // Intelligence, Wisdom and Charisma stay the druid's.
    expect(sheet.shape!.abilities.wis).toMatchObject({ score: 16, mine: true });
    expect(sheet.shape!.abilities.str.score).toBe(12);
    expect(sheet.resources.find((r) => r.id === "wild-shape")!.remaining).toBe(1);
    expect(sheet.shape!.attacks[0]).toMatchObject({ name: "Bite", damage: { dice: "2d4", type: "piercing" } });
    log.record("damage", { amount: 5 });
    expect(log.character.shape!.hp).toBe(6);
    expect(log.character.hp.current).toBe(before);
    const notes = log.record("damage", { amount: 9 }).join(" ");
    expect(notes).toMatch(/back in your normal form, and 3 damage carries over/);
    expect(log.character.shape).toBeUndefined();
    expect(log.character.hp.current).toBe(before - 3);
  });

  it("warns about beasts beyond the limits and spells in beast form", () => {
    const log = druid(2);
    expect(log.record("transform", { kind: "wildshape", creature: "creature:brown-bear" }).join(" ")).toMatch(/Beyond the rules: CR 1 is above your 1\/4/);
    expect(turnWarnings(log.character, sheetOf(log), { name: "Cure Wounds", economy: "action", spell: { level: 1, concentration: false } }).join(" ")).toMatch(/can't cast spells in Wild Shape/);
    log.record("heal", { amount: 100 });
    expect(log.character.shape!.hp).toBe(34);
    log.record("revert", {});
    expect(sheetOf(log).shape).toBeUndefined();
  });

  it("Polymorph replaces everything, mind included", () => {
    const log = druid(2);
    log.record("transform", { kind: "polymorph", creature: "creature:giant-ape", uses: 0 });
    const s = sheetOf(log).shape!;
    expect(s.abilities.wis).toMatchObject({ score: 12, mine: false });
    expect(sheetOf(log).resources.find((r) => r.id === "wild-shape")!.remaining).toBe(2);
  });
});

describe("starting equipment", () => {
  it("class options and background gear go into the inventory, armor worn", () => {
    const fighter = reg.get("class:fighter", "class");
    expect(fighter.startingEquipment!.options.length).toBeGreaterThan(2);
    const c = newCharacter(
      {
        id: "f",
        name: "Kit",
        race: "race:human",
        class: "class:fighter",
        abilities: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
        equipment: [{ item: "item:chain-mail", quantity: 1 }, { item: "item:longsword", quantity: 1 }, { item: "item:shield", quantity: 1 }, { item: "item:explorers-pack", quantity: 1 }],
        gear: ["a letter from home"],
        gold: 10,
      },
      reg,
    );
    const items = c.inventory.map((i) => i.item);
    expect(items).toEqual(expect.arrayContaining(["item:chain-mail", "item:longsword", "item:shield", "item:backpack", "item:bedroll", "item:other-gear"]));
    expect(items).not.toContain("item:explorers-pack");
    expect(c.inventory.find((i) => i.item === "item:chain-mail")!.equipped).toBe(true);
    expect(c.currency.gp).toBe(10);
    expect(derive(c, reg).ac.total).toBe(18);
  });
});

describe("damage type choices", () => {
  it("Chromatic Orb offers its types; Transmuted Spell is offered to a sorcerer who has it", () => {
    reg.add({
      id: "test-orb",
      title: "Test",
      ruleset: "5e-2014",
      license: "none",
      visibility: "private",
      definitions: [
        {
          kind: "spell", id: "spell:test-orb", name: "Test Orb", level: 1, school: "Evocation", castingTime: "1 action", range: "90 feet", components: ["V", "S"],
          duration: "Instantaneous", concentration: false, ritual: false, classes: ["sorcerer"], source: { pack: "test-orb" },
          text: ["You hurl a sphere. You choose acid, cold, fire, lightning, poison, or thunder for the type of orb you create."],
          attack: "ranged", damage: { type: "acid", atSlot: { "1": "3d8" } },
        },
      ],
    } as never);
    const c = newCharacter({ id: "s", name: "Sorc", race: "race:human", class: "class:sorcerer", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 16 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 3 };
    c.spells.push({ spell: "spell:test-orb", list: "sorcerer", prepared: false }, { spell: "spell:burning-hands", list: "sorcerer", prepared: false });
    c.choices["feature:metamagic-1"] = { option: ["feature:metamagic-transmuted-spell", "feature:metamagic-quickened-spell"] };
    const sheet = derive(c, reg);
    const orb = sheet.spells.find((s) => s.id === "spell:test-orb")!;
    expect(orb.typeChoices?.find((x) => x.kind === "spell")?.options).toEqual(["acid", "cold", "fire", "lightning", "poison", "thunder"]);
    const hands = sheet.spells.find((s) => s.id === "spell:burning-hands")!;
    expect(hands.typeChoices?.find((x) => x.kind === "transmuted")).toMatchObject({ cost: { resource: "sorcery-points", amount: 1 } });
  });
});
