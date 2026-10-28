import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_807_000_000_000;
const make = (cls: string, level: number, items: string[], extra: (c: ReturnType<typeof newCharacter>) => void = () => {}) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: cls, abilities: { str: 14, dex: 14, con: 14, int: 16, wis: 16, cha: 16 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level };
  c.inventory.push(...items.map((item, i) => ({ id: `m${i}`, item, quantity: 1, equipped: true, attuned: true })));
  extra(c);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("13e limits fixed in play", () => {
  it("casting from a wand spends its charges by the level", () => {
    const l = make("class:wizard", 5, ["item:wand-of-fireballs"]);
    const notes = l.record("castSpell", { spell: "spell:fireball", list: "wizard", level: 4, using: "charges" });
    expect(l.character.inventory.find((i) => i.id === "m0")?.chargesUsed).toBe(2);
    expect(notes.join(" ")).toMatch(/2 charges spent, 5 left/);
  });
  it("Rod of the Pact Keeper: one Pact Magic slot back, not all", () => {
    const l = make("class:warlock", 5, ["item:rod-of-the-pact-keeper-1"], (c) => (c.pactSlotsUsed = 2));
    l.record("useAction", { action: "pact-keeper-1" });
    expect(l.character.pactSlotsUsed).toBe(1);
  });
  it("Amulet of the Devout: a paladin's Channel Divinity back", () => {
    const l = make("class:paladin", 3, ["item:amulet-of-the-devout-1"], (c) => {
      c.classes[0]!.subclass = "subclass:devotion";
      c.resourcesUsed["channel-divinity-paladin"] = 1;
    });
    l.record("useAction", { action: "devout-1" });
    expect(l.character.resourcesUsed["channel-divinity-paladin"]).toBe(0);
  });
  it("Frost Brand: which sword it is; Periapt of Wound Closure doubles a Hit Die", () => {
    const l = make("class:fighter", 5, ["item:frost-brand-longsword", "item:periapt-of-wound-closure"], (c) => (c.hp.current = 10));
    l.record("setItem", { instanceId: "m0", base: "item:greatsword" });
    expect(l.character.inventory[0]!.base).toBe("item:greatsword");
    l.record("spendHitDie", { die: "d10", roll: 4 });
    expect(l.character.hp.current).toBe(10 + (4 + 2) * 2);
  });
});

describe("13f limits fixed in play", () => {
  it("Tales from Beyond: the tale is held as a tag, replaced by a new roll, gone when bestowed", () => {
    const l = make("class:bard", 6, [], (c) => (c.classes[0]!.subclass = "subclass:college-of-spirits"));
    l.record("useAction", { action: "tales-from-beyond", rolled: 1 });
    expect(l.character.effects.filter((e) => e.custom?.name.startsWith("Tale held")).map((e) => e.custom!.name)).toEqual(["Tale held: Clever Animal"]);
    l.record("useAction", { action: "tales-from-beyond", rolled: 6 });
    expect(l.character.effects.filter((e) => e.custom?.name.startsWith("Tale held")).map((e) => e.custom!.name)).toEqual(["Tale held: Traveler"]);
    l.record("useAction", { action: "tales-from-beyond-bestow", rolled: 3 });
    expect(l.character.effects.some((e) => e.custom?.name.startsWith("Tale held"))).toBe(false);
  });
  it("Spirit Session: its tag lasts until the long rest", () => {
    const l = make("class:bard", 6, [], (c) => (c.classes[0]!.subclass = "subclass:college-of-spirits"));
    l.record("useAction", { action: "spirit-session" });
    expect(l.character.effects.some((e) => e.effect === "effect:spirit-session")).toBe(true);
    l.record("rest", { kind: "short" });
    expect(l.character.effects.some((e) => e.effect === "effect:spirit-session")).toBe(true);
    l.record("rest", { kind: "long" });
    expect(l.character.effects.some((e) => e.effect === "effect:spirit-session")).toBe(false);
  });
});
