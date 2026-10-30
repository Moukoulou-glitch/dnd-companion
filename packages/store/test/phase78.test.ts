import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_820_000_000_000;
const scribe = (spells: string[]) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: "class:wizard", abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 14, cha: 10 } }, reg);
  c.classes = [{ class: "class:wizard", level: 10, subclass: "subclass:order-of-scribes" }];
  c.hp = { current: 60, temp: 0 };
  c.spells = spells.map((spell) => ({ spell, list: "wizard", prepared: true }));
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("18a: Magic Missile and Awakened Spellbook", () => {
  it("Magic Missile: one dart's dice, and the darts at each slot level", () => {
    const s = derive(scribe(["spell:magic-missile"]).character, reg);
    const mm = s.spells.find((x) => x.id === "spell:magic-missile")!;
    expect(mm.darts).toMatchObject({ dice: "1d4 + 1", what: "darts" });
    expect(mm.darts!.byLevel[1]).toBe(3);
    expect(mm.darts!.byLevel[3]).toBe(5);
  });
  it("Awakened Spellbook: types from other spellbook spells of the slot's level, choices and extra parts included", () => {
    const s = derive(scribe(["spell:burning-hands", "spell:chromatic-orb", "spell:shatter", "spell:ice-storm", "spell:fireball"]).character, reg);
    const bh = s.spells.find((x) => x.id === "spell:burning-hands")!;
    const aw = bh.typeChoices?.find((x) => x.kind === "awakened");
    // Chromatic Orb's choices are in the spellbook at 1st level.
    expect(aw?.byLevel?.[1]).toEqual(expect.arrayContaining(["acid", "cold", "lightning", "poison", "thunder"]));
    expect(aw?.byLevel?.[1]).not.toContain("fire");
    expect(aw?.byLevel?.[2]).toContain("thunder");
    // Ice Storm's bludgeoning part counts at 4th.
    expect(aw?.byLevel?.[4]).toEqual(expect.arrayContaining(["bludgeoning", "cold"]));
  });
  it("A wizard ritual can be cast at its normal time once per long rest: it spends that use and takes its action", () => {
    const l = scribe(["spell:detect-magic"]);
    const before = derive(l.character, reg).spells.find((x) => x.id === "spell:detect-magic")!;
    expect(before.cast.fastRitual).toMatchObject({ resource: "awakened-spellbook", remaining: 1 });
    l.record("startCombat", {});
    l.record("startTurn", {});
    const notes = l.record("castSpell", { spell: "spell:detect-magic", list: "wizard", level: 1, using: "ritual", fastRitual: true });
    expect(notes.join(" ")).toMatch(/Awakened Spellbook: ritual at its normal casting time/);
    expect(l.character.resourcesUsed["awakened-spellbook"]).toBe(1);
    expect(l.character.slotsUsed["1"] ?? 0).toBe(0);
    // Detect Magic takes its 1 action.
    expect(l.character.combat!.action).toBe(1);
    // Again before a long rest: warned, still cast.
    expect(l.record("castSpell", { spell: "spell:detect-magic", list: "wizard", level: 1, using: "ritual", fastRitual: true }).join(" ")).toMatch(/already used since your long rest/);
    l.record("rest", { kind: "long" });
    expect(derive(l.character, reg).spells.find((x) => x.id === "spell:detect-magic")!.cast.fastRitual?.remaining).toBe(1);
  });
  it("A plain ritual spends nothing, and a non-wizard has no fast ritual", () => {
    const l = scribe(["spell:detect-magic"]);
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("castSpell", { spell: "spell:detect-magic", list: "wizard", level: 1, using: "ritual" });
    expect(l.character.resourcesUsed["awakened-spellbook"] ?? 0).toBe(0);
    expect(l.character.combat!.action).toBe(0);
    const c = newCharacter({ id: "q", name: "Cleric", race: "race:human", class: "class:cleric", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
    c.classes = [{ class: "class:cleric", level: 5 }];
    const s = derive(c, reg);
    expect(s.spells.filter((x) => x.ritual).every((x) => !x.cast.fastRitual)).toBe(true);
  });
});
