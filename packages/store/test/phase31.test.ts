import { describe, expect, it } from "vitest";
import type { Character } from "@dnd/schema";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_804_000_000_000;
/** Sorcerer 3 / Warlock 3: ordinary slots 4 × 1st and 2 × 2nd (sorcerer only), Pact Magic 2 × 2nd. */
const sorlock = (sorc = 3, lock = 3) => {
  const c = newCharacter({ id: "s", name: "S", race: "race:human", class: "class:sorcerer", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 17 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: sorc };
  c.classes.push({ class: "class:warlock", level: lock } as never);
  c.spells.push({ spell: "spell:shield", list: "sorcerer" } as never, { spell: "spell:scorching-ray", list: "sorcerer" } as never, { spell: "spell:unseen-servant", list: "warlock" } as never);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const spell = (c: Character, id: string, list?: string) => derive(c, reg).spells.find((s) => s.id === id && (!list || s.list.id === list))!;

describe("Pact Magic and Spellcasting slots, both ways (PHB p. 164)", () => {
  it("a warlock spell can use your Spellcasting slots, and your other spells your Pact Magic slots", () => {
    const l = sorlock();
    const s = derive(l.character, reg);
    expect(s.spellSlots.filter((x) => x.total > 0).map((x) => [x.level, x.total])).toEqual([[1, 4], [2, 2]]);
    expect(s.pactSlots).toEqual({ count: 2, level: 2, used: 0 });
    // Warlock spell: ordinary slots too (and its Pact slot).
    expect(spell(l.character, "spell:unseen-servant").cast).toMatchObject({ slotLevels: [1, 2], pact: { level: 2, remaining: 2 } });
    // Sorcerer spells: a Pact slot too, when the spell's level fits it.
    expect(spell(l.character, "spell:shield").cast).toMatchObject({ slotLevels: [1, 2], pact: { level: 2, remaining: 2 } });
    expect(spell(l.character, "spell:scorching-ray").cast).toMatchObject({ slotLevels: [2], pact: { level: 2 } });
  });

  it("a spell above the Pact slot's level gets no Pact option", () => {
    const l = sorlock(5, 1); // Pact 1st level; sorcerer 3rd-level slots.
    expect(spell(l.character, "spell:scorching-ray").cast.pact).toBeUndefined();
    expect(spell(l.character, "spell:shield").cast.pact).toMatchObject({ level: 1 });
  });

  it("casting spends the slot you picked; a short rest brings back only Pact slots", () => {
    const l = sorlock();
    l.record("castSpell", { spell: "spell:unseen-servant", list: "warlock", level: 1, using: "slot" });
    l.record("castSpell", { spell: "spell:shield", list: "sorcerer", level: 2, using: "pact" });
    expect(l.character.slotsUsed["1"]).toBe(1);
    expect(l.character.pactSlotsUsed).toBe(1);
    expect(derive(l.character, reg).pactSlots!.used).toBe(1);
    l.record("rest", { kind: "short" });
    expect(l.character.pactSlotsUsed).toBe(0);
    expect(l.character.slotsUsed["1"]).toBe(1);
    l.record("rest", { kind: "long" });
    expect(l.character.slotsUsed["1"] ?? 0).toBe(0);
  });

  it("Font of Magic can turn a Pact slot into sorcery points", () => {
    const l = sorlock();
    l.character.resourcesUsed["sorcery-points"] = 3;
    const a = derive(l.character, reg).actions.find((x) => x.id === "flexible-to-points")!;
    const opt = a.choose!.options.find((o) => /^Pact/.test(o))!;
    expect(opt).toBe("Pact Magic slot (Level 2) into 2 points");
    l.record("useAction", { action: "flexible-to-points", choice: opt });
    expect(l.character.pactSlotsUsed).toBe(1);
    expect(l.character.resourcesUsed["sorcery-points"]).toBe(1);
    expect(l.character.slotsUsed["2"] ?? 0).toBe(0);
  });

  it("a Mystic Arcanum (warlock spell of 6th level+) is never cast with a slot", () => {
    const l = sorlock(11, 11);
    l.character.spells.push({ spell: "spell:eyebite", list: "warlock" } as never);
    expect(derive(l.character, reg).spellSlots.find((x) => x.level === 6)!.total).toBeGreaterThan(0);
    expect(spell(l.character, "spell:eyebite", "warlock").cast.slotLevels).toEqual([]);
    expect(spell(l.character, "spell:eyebite", "warlock").cast.pact).toBeUndefined();
  });

  it("a single-class warlock is as before: Pact slots only", () => {
    const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:warlock", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 17 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 5 };
    c.spells.push({ spell: "spell:unseen-servant", list: "warlock" } as never);
    expect(spell(c, "spell:unseen-servant").cast).toMatchObject({ slotLevels: [], pact: { level: 3, remaining: 2 } });
  });
});
