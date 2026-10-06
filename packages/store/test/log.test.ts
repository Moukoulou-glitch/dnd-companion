import { describe, expect, it } from "vitest";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();

function logFor(name: string, device = "phone") {
  let t = 1_700_000_000_000;
  const clock = new HybridClock(device, () => (t += 1000));
  return new CharacterLog(loadCharacter(name), reg, clock, "player");
}

describe("HP", () => {
  it("damage, undo, redo", () => {
    const log = logFor("beren");
    log.record("damage", { amount: 10, damageType: "slashing" });
    expect(log.character.hp.current).toBe(26);
    log.undo();
    expect(log.character.hp.current).toBe(36);
    expect(log.canRedo).toBe(true);
    log.redo();
    expect(log.character.hp.current).toBe(26);
  });

  it("a new action after undo clears redo", () => {
    const log = logFor("beren");
    log.record("damage", { amount: 10 });
    log.undo();
    log.record("damage", { amount: 3 });
    expect(log.canRedo).toBe(false);
    expect(log.character.hp.current).toBe(33);
  });

  it("temporary HP absorb damage first and don't stack", () => {
    const log = logFor("beren");
    log.record("setTempHp", { amount: 5 });
    expect(log.record("setTempHp", { amount: 3 })).toEqual(["Temporary HP don't stack: keeping 5, the higher value."]);
    log.record("damage", { amount: 8 });
    expect(log.character.hp).toEqual({ current: 33, temp: 0 });
  });

  it("resistance halves damage, rounding down (Tiefling, fire)", () => {
    const log = logFor("aristotelis");
    const notes = log.record("damage", { amount: 9, damageType: "fire" });
    expect(log.character.hp.current).toBe(26 - 4);
    expect(notes).toEqual(["Resistant to fire: 9 halved to 4."]);
  });

  it("Rage resistance only while raging", () => {
    const log = logFor("agaklis");
    log.record("damage", { amount: 20, damageType: "slashing" });
    expect(log.character.hp.current).toBe(75);
    log.record("toggle", { name: "raging", on: true });
    log.record("damage", { amount: 20, damageType: "slashing" });
    expect(log.character.hp.current).toBe(65);
  });

  it("dropping to 0, death saves, and healing back up", () => {
    const log = logFor("beren");
    expect(log.record("damage", { amount: 40 })).toEqual(["Dropped to 0 HP: unconscious. Death saves start on your turn."]);
    log.record("damage", { amount: 3 });
    log.record("deathSave", { result: "failure" });
    expect(log.character.deathSaves).toEqual({ successes: 0, failures: 2 });
    log.record("heal", { amount: 5 });
    expect(log.character.hp.current).toBe(5);
    expect(log.character.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("massive damage is instant death", () => {
    const log = logFor("beren");
    const notes = log.record("damage", { amount: 72 });
    expect(notes[0]).toMatch(/instant death/);
    expect(log.character.deathSaves.failures).toBe(3);
  });

  it("healing is capped at the maximum", () => {
    const log = logFor("beren");
    log.record("damage", { amount: 5 });
    expect(log.record("heal", { amount: 50 })).toEqual(["Healing capped at your maximum of 36."]);
    expect(log.character.hp.current).toBe(36);
  });
});

describe("resources, slots and rests", () => {
  it("over-spending is recorded as fully used, with a note, never refused", () => {
    const log = logFor("beren");
    log.record("spendResource", { resource: "favored-foe" });
    log.record("spendResource", { resource: "favored-foe" });
    expect(log.record("spendResource", { resource: "favored-foe" })).toEqual([
      "Favored Foe: no uses left (2 maximum). Recorded as fully used.",
    ]);
    expect(log.character.resourcesUsed["favored-foe"]).toBe(2);
  });

  it("short rest restores short-rest features only; long rest restores everything", () => {
    const log = logFor("beren");
    log.record("spendResource", { resource: "fey-step" });
    log.record("spendResource", { resource: "favored-foe" });
    log.record("spendSlot", { level: 1 });
    log.record("damage", { amount: 20 });

    expect(log.record("rest", { kind: "short" })).toEqual(["Restored: Fey Step."]);
    expect(log.character.resourcesUsed).toEqual({ "favored-foe": 1 });
    expect(log.character.slotsUsed).toEqual({ "1": 1 });
    expect(log.character.hp.current).toBe(16);

    log.record("rest", { kind: "long" });
    expect(log.character.resourcesUsed).toEqual({});
    expect(log.character.slotsUsed).toEqual({});
    expect(log.character.hp.current).toBe(36);
  });

  it("spending a slot you don't have is noted, not recorded", () => {
    const log = logFor("beren");
    for (let i = 0; i < 3; i++) log.record("spendSlot", { level: 1 });
    expect(log.record("spendSlot", { level: 1 })).toEqual(["No level 1 slots left."]);
    expect(log.character.slotsUsed["1"]).toBe(3);
  });

  it("Pact Magic slots come back on a short rest", () => {
    const log = logFor("elissaios");
    log.record("spendSlot", { level: 1, pact: true });
    expect(log.character.pactSlotsUsed).toBe(1);
    log.record("rest", { kind: "short" });
    expect(log.character.pactSlotsUsed).toBe(0);
  });

  it("Hit Dice heal die + Constitution and come back by half on a long rest", () => {
    const log = logFor("agaklis");
    log.record("damage", { amount: 50 });
    for (let i = 0; i < 6; i++) log.record("spendHitDie", { die: "d12", roll: 7 });
    expect(log.character.hp.current).toBe(95);
    expect(log.character.hitDiceUsed).toEqual({ d12: 6 });
    log.record("rest", { kind: "long" });
    expect(log.character.hitDiceUsed).toEqual({ d12: 2 });
  });
});

describe("edits and sync", () => {
  it("a field edit that breaks the character is rejected and never logged", () => {
    const log = logFor("beren");
    expect(() => log.record("setField", { path: ["abilities", "str"], value: 99 })).toThrow();
    expect(log.operations).toHaveLength(0);
    log.record("setField", { path: ["abilities", "str"], value: 12 });
    expect(log.character.abilities.str).toBe(12);
  });

  it("two devices editing offline end at the same character after merging", () => {
    const phone = logFor("beren", "phone");
    const tablet = logFor("beren", "tablet");
    phone.record("damage", { amount: 10 });
    tablet.record("spendSlot", { level: 1 });
    tablet.record("heal", { amount: 4 });

    phone.merge([...tablet.operations]);
    tablet.merge([...phone.operations]);

    const strip = (c: Character) => JSON.stringify(c);
    expect(strip(phone.character)).toBe(strip(tablet.character));
    expect(phone.character.slotsUsed).toEqual({ "1": 1 });
  });
});

describe("hybrid clock", () => {
  it("stays ordered when the wall clock stands still or goes backwards", () => {
    const times = [1000, 1000, 900, 2000];
    const clock = new HybridClock("a", () => times.shift()!);
    const stamps = [clock.tick(), clock.tick(), clock.tick(), clock.tick()];
    expect([...stamps].sort()).toEqual(stamps);
    expect(new Set(stamps).size).toBe(4);
  });
});
