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

describe("18d: Thinking Stone stores the spell; its effect comes when the object is used", () => {
  const gnome = () => {
    const c = newCharacter({ id: "g", name: "Rock", race: "race:rock-gnome", class: "class:wizard", abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 14, cha: 10 } }, reg);
    c.classes = [{ class: "class:wizard", level: 10 }];
    c.hp = { current: 60, temp: 0 };
    c.choices["feature:heritage-thinking-stone"] = { "spells-1": ["spell:longstrider", "spell:shield", "spell:magic-missile", "spell:sleep"], "spells-2": ["spell:misty-step", "spell:mirror-image", "spell:scorching-ray"] };
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("storing: the object goes to the inventory, the casting time is spent, no effect on you", () => {
    const l = gnome();
    const sp = derive(l.character, reg).spells.find((x) => x.id === "spell:longstrider" && x.list.id === "thinking-stone")!;
    expect(sp.stores).toBe(true);
    l.record("startCombat", {});
    l.record("startTurn", {});
    const notes = l.record("castSpell", { spell: "spell:longstrider", list: "thinking-stone", level: 1, using: "extra", selfEffect: true });
    expect(notes.join(" ")).toMatch(/stored in an object.*Its effect comes when the object is used/);
    expect(l.character.effects.some((e) => e.effect === "effect:longstrider")).toBe(false);
    expect(l.character.inventory.some((i) => i.scroll?.stored && i.scroll.spell === "spell:longstrider")).toBe(true);
    expect(l.character.combat!.action).toBe(1);
    // Using the object: now Longstrider takes effect.
    const obj = derive(l.character, reg).spells.find((x) => x.id === "spell:longstrider" && x.cast.scroll?.stored)!;
    l.record("castSpell", { spell: "spell:longstrider", list: obj.list.id, level: 1, using: "scroll", selfEffect: true });
    expect(l.character.effects.some((e) => e.effect === "effect:longstrider")).toBe(true);
    expect(l.character.inventory.some((i) => i.scroll?.stored && i.scroll.spell === "spell:longstrider")).toBe(false);
  });
  it("storing Mirror Image or Shield puts nothing on you either", () => {
    const l = gnome();
    l.record("castSpell", { spell: "spell:mirror-image", list: "thinking-stone", level: 2, using: "extra", selfEffect: true });
    l.record("castSpell", { spell: "spell:shield", list: "thinking-stone", level: 1, using: "extra", selfEffect: true });
    expect(l.character.effects).toEqual([]);
    expect(l.character.inventory.filter((i) => i.scroll?.stored).length).toBe(2);
  });
});

describe("18g: Harness Divine Power once for a cleric/paladin, like Channel Divinity", () => {
  const multi = (cl: number, pal: number) => {
    const c = newCharacter({ id: "m", name: "Both", race: "race:human", class: "class:cleric", abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 16 } }, reg);
    c.classes = [
      { class: "class:cleric", level: cl, subclass: "subclass:light-domain" },
      { class: "class:paladin", level: pal, subclass: "subclass:oath-of-the-ancients" },
    ];
    c.hp = { current: 40, temp: 0 };
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("one pool and one action, with the larger number of uses", () => {
    const s = derive(multi(6, 3).character, reg);
    expect(s.resources.filter((r) => r.id === "harness-divine-power")).toHaveLength(1);
    expect(s.resources.find((r) => r.id === "harness-divine-power")!.max).toBe(2);
    expect(s.actions.filter((a) => a.id === "harness-divine-power")).toHaveLength(1);
    expect(s.resources.filter((r) => /channel-divinity/.test(r.id))).toHaveLength(1);
  });
  it("used, and back after a long rest", () => {
    const l = multi(2, 3);
    l.record("castSpell", { spell: "spell:bless", list: "cleric", level: 1, using: "slot" });
    l.record("useAction", { action: "harness-divine-power", choice: "Level 1 slot" });
    expect(derive(l.character, reg).resources.find((r) => r.id === "harness-divine-power")!.remaining).toBe(0);
    l.record("rest", { kind: "long" });
    expect(derive(l.character, reg).resources.find((r) => r.id === "harness-divine-power")!.remaining).toBe(1);
  });
});
