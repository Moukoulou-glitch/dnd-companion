import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_814_000_000_000;
const eladrin = (level: number, season?: string) => {
  const c = newCharacter({ id: "e", name: "Test", race: "race:eladrin", class: "class:cleric", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 16, cha: 16 } }, reg);
  c.classes = [{ class: "class:cleric", level }];
  if (season) c.choices["race:eladrin"] = { season: [season] };
  c.hp = { current: 40, temp: 0 };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("Eladrin and Unbridled Seasons in play", () => {
  it("Heammer: Beacon of Hope through Unbridled Seasons takes no concentration, and its use is spent", () => {
    const l = eladrin(10, "Heammer");
    l.record("castSpell", { spell: "spell:bless", list: "cleric", level: 1, using: "slot" });
    expect(l.character.concentration?.spell).toBe("spell:bless");
    const notes = l.record("castSpell", { spell: "spell:beacon-of-hope", list: "unbridled-seasons", level: 3, using: "free" }).join(" ");
    expect(notes).toMatch(/no concentration this time/);
    expect(l.character.concentration?.spell).toBe("spell:bless");
    expect(l.character.resourcesUsed["unbridled-seasons-spell"]).toBe(1);
  });
  it("a long rest reminds an eladrin the season can change", () => {
    expect(eladrin(3, "Nocter").record("rest", { kind: "long" }).join(" ")).toMatch(/your season is Nocter; you can change it now/);
    expect(eladrin(3).record("rest", { kind: "long" }).join(" ")).toMatch(/choose your season/);
  });
});

describe("Thinking Stone in play (17a)", () => {
  const gnome = () => {
    const c = newCharacter({ id: "g", name: "Rock", race: "race:rock-gnome", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 18, wis: 10, cha: 10 } }, reg);
    c.classes = [{ class: "class:wizard", level: 10 }];
    c.choices["feature:heritage-thinking-stone"] = { "spells-1": ["spell:magic-missile"] };
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("casting one stores it in an object in the inventory (DC 8 + PB, + PB), once per long rest each, and the object is a use-it action that's used up", () => {
    const l = gnome();
    l.record("castSpell", { spell: "spell:magic-missile", list: "thinking-stone", level: 1, using: "extra" });
    const obj = l.character.inventory.find((i) => i.item === "item:thinking-stone-object")!;
    expect(obj).toMatchObject({ name: "Thinking Stone: Magic Missile", scroll: { spell: "spell:magic-missile", stored: true, dc: 12, attack: 4, by: "Rock" } });
    expect(derive(l.character, reg).spells.find((s) => s.list.id === "thinking-stone")?.cast).toMatchObject({ slotLevels: [], extra: { perLong: 1, sinceLong: 1 } });
    expect(l.record("castSpell", { spell: "spell:magic-missile", list: "thinking-stone", level: 1, using: "extra" }).join(" ")).toMatch(/already cast 1 time since your long rest \(1 allowed\)/);
    const act = derive(l.character, reg).actions.find((a) => a.id === `stored-${obj.id}`)!;
    expect(act).toMatchObject({ economy: "action", name: "Magic Missile (stored)", spells: [{ id: "spell:magic-missile", list: `scroll-${obj.id}` }] });
    const stored = derive(l.character, reg).spells.find((s) => s.list.id === `scroll-${obj.id}`)!;
    expect(stored.cast.scroll).toMatchObject({ stored: true, dc: 12, attack: 4, onList: true });
    expect(stored.cast.scroll?.check).toBeUndefined();
    expect(l.record("castSpell", { spell: "spell:magic-missile", list: `scroll-${obj.id}`, level: 1, using: "scroll" }).join(" ")).toMatch(/released from the object/);
    expect(l.character.inventory.some((i) => i.id === obj.id)).toBe(false);
    expect(derive(l.character, reg).spellcasting.find((s) => s.id === "thinking-stone")?.tab).toBe("Thinking Stone spells");
  });
  it("someone else's object or Master Scrivener scroll: their numbers", () => {
    const l = eladrin(3, "Heammer");
    l.record("addItem", { instanceId: "obj", item: "item:thinking-stone-object" });
    l.record("setItem", { instanceId: "obj", scroll: { spell: "spell:shield", level: 1, stored: true, dc: 13, attack: 5, by: "Pip" } });
    expect(derive(l.character, reg).actions.find((a) => a.id === "stored-obj")).toMatchObject({ economy: "reaction" });
    l.record("addItem", { instanceId: "sc", item: "item:spell-scroll-3rd-level" });
    l.record("setItem", { instanceId: "sc", scroll: { spell: "spell:fireball", dc: 17, attack: 9, by: "Mira" } });
    const fb = derive(l.character, reg).spells.find((s) => s.list.id === "scroll-sc")!;
    expect(fb.save?.dc).toBe(17);
    expect(fb.cast.scroll?.check).toBeUndefined();
    expect(fb.fromFeature).toMatch(/by Mira/);
  });
});
