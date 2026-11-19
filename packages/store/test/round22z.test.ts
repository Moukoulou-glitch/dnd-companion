import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_899_000_000_000;

describe("22z: Whistle of the Ashen Gale (homebrew)", () => {
  const pc = (cha: number) => {
    const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha } }, reg);
    c.classes = [{ class: "class:fighter", level: 5 }];
    c.inventory.push({ id: "wh", item: "item:whistle-of-the-ashen-gale", quantity: 1, equipped: true, attuned: true });
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("Charisma 16 unless higher; thaumaturgy; the wind adds 10 × proficiency bonus to speed, once per short rest", () => {
    const l = pc(8);
    const s = derive(l.character, reg);
    expect(s.abilities.cha.score.total).toBe(16);
    expect(derive(pc(17).character, reg).abilities.cha.score.total).toBe(18);
    expect(s.spells.some((x) => x.id === "spell:thaumaturgy")).toBe(true);
    const before = s.speed.total;
    l.record("useAction", { action: "whistle-ashen-gale" });
    expect(derive(l.character, reg).speed.total).toBe(before + 30);
    expect(l.character.resourcesUsed["whistle-ashen-gale"]).toBe(1);
    l.record("rest", { kind: "short" });
    expect(l.character.resourcesUsed["whistle-ashen-gale"] ?? 0).toBe(0);
  });
});

describe("23a: Tithanonas' Spell Shard (homebrew)", () => {
  const pc = () => {
    const c = newCharacter({ id: "s", name: "S", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 } }, reg);
    c.classes = [{ class: "class:wizard", level: 5 }];
    c.inventory.push({ id: "sh", item: "item:tithanonas-spell-shard", quantity: 1, equipped: true, attuned: true });
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  const spell = (l: CharacterLog, id: string) => derive(l.character, reg).spells.find((x) => x.id === id);
  it("casts its spells for charges, with the extra-charge options", () => {
    const l = pc();
    const ls = spell(l, "spell:longstrider")!;
    expect(ls.cast.charges?.options.map((o) => [o.level, o.cost, o.label ?? ""])).toEqual([[1, 1, ""], [1, 4, "speed +20 ft instead of +10"]]);
    l.record("castSpell", { spell: "spell:longstrider", list: ls.list.id, level: 1, using: "charges", selfEffect: true, chargeOption: 1 } as never);
    expect(l.character.inventory.find((i) => i.id === "sh")?.chargesUsed).toBe(4);
    expect(l.character.effects.some((e) => e.effect === "effect:shard-longstrider")).toBe(true);
    expect(derive(l.character, reg).speed.total).toBe(50);
    const bd = spell(l, "spell:blindness-deafness")!;
    l.record("castSpell", { spell: bd.id, list: bd.list.id, level: 2, using: "charges", selfEffect: false } as never);
    expect(l.character.inventory.find((i) => i.id === "sh")?.chargesUsed).toBe(6);
    expect(spell(l, "spell:animate-dead")).toBeUndefined();
  });
  it("Spell Storing: a slot's level back as charges, never past 10", () => {
    const l = pc();
    l.character.inventory.find((i) => i.id === "sh")!.chargesUsed = 2;
    l.record("useAction", { action: "shard-store-slot", choice: "3rd-level slot" });
    expect(l.character.slotsUsed["3"]).toBe(1);
    expect(l.character.inventory.find((i) => i.id === "sh")?.chargesUsed).toBeUndefined();
  });
  it("Tier II: +2 DC on its spells, Animate Dead and Bestow Curse, disadvantage on initiative; the Burden stops you", () => {
    const l = pc();
    const before = spell(l, "spell:blindness-deafness")!.save!.dc;
    l.record("useAction", { action: "shard-tier-2" });
    const s = derive(l.character, reg);
    expect(s.spells.find((x) => x.id === "spell:blindness-deafness")!.save!.dc).toBe(before + 2);
    expect(s.spells.some((x) => x.id === "spell:animate-dead")).toBe(true);
    expect(s.spells.some((x) => x.id === "spell:bestow-curse")).toBe(true);
    expect(s.initiative.disadvantage.length).toBeGreaterThan(0);
    l.record("useAction", { action: "shard-burden" });
    expect(derive(l.character, reg).speed.total).toBe(0);
  });
});

describe("23b: Corpse Slayer", () => {
  it("a +1 weapon on any of its bases, with 1d8 more against undead", () => {
    const c = newCharacter({ id: "k", name: "K", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    c.classes = [{ class: "class:fighter", level: 5 }];
    c.inventory.push({ id: "cs", item: "item:corpse-slayer-longsword", quantity: 1, equipped: true, attuned: true, base: "item:greataxe" });
    const s = derive(c, reg);
    const a = s.attacks.find((x) => /Corpse Slayer/.test(x.name))!;
    expect(a.damage.dice).toBe("1d12");
    expect(a.attack.parts.some((p) => p.value === 1)).toBe(true);
    expect(a.damage.bonus.suggestions.find((x) => x.label === "Corpse Slayer")).toBeDefined();
  });
});

describe("23c: more languages to pick", () => {
  it("Primordial's dialects, Druidic, Thieves' Cant and the Language of Silence", async () => {
    const { LANGUAGES } = await import("@dnd/engine");
    for (const l of ["Aquan", "Auran", "Ignan", "Terran", "Druidic", "Thieves' Cant", "Language of Silence"]) expect(LANGUAGES).toContain(l);
  });
});

describe("23d: the classes' secret languages come with the class", () => {
  it("a druid knows Druidic, a rogue Thieves' Cant", () => {
    const of = (cls: string) => {
      const c = newCharacter({ id: "l", name: "L", race: "race:human", class: cls, abilities: { str: 10, dex: 14, con: 12, int: 10, wis: 14, cha: 10 } }, reg);
      return derive(c, reg).proficiencies.languages;
    };
    expect(of("class:druid")).toContain("Druidic");
    expect(of("class:rogue")).toContain("Thieves' Cant");
    expect(of("class:fighter")).not.toContain("Druidic");
  });
});

describe("23e: languages in alphabetical order", () => {
  it("the list offered and the sheet's own", async () => {
    const { LANGUAGES } = await import("@dnd/engine");
    expect([...LANGUAGES]).toEqual([...LANGUAGES].sort((a, b) => a.localeCompare(b)));
    const c = newCharacter({ id: "a", name: "A", race: "race:human", class: "class:druid", abilities: { str: 10, dex: 14, con: 12, int: 10, wis: 14, cha: 10 } }, reg);
    c.choices["race:human"] = { ...(c.choices["race:human"] ?? {}) };
    const langs = derive(c, reg).proficiencies.languages;
    expect(langs).toEqual([...langs].sort((a, b) => a.localeCompare(b)));
  });
});

describe("23k: Form of the Beast lasts as long as the rage", () => {
  it("the pick is a state, and it ends with the rage", () => {
    const c = newCharacter({ id: "b", name: "B", race: "race:human", class: "class:barbarian", abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } }, reg);
    c.classes = [{ class: "class:barbarian", level: 3, subclass: "subclass:path-of-the-beast" }];
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("useAction", { action: "rage" });
    l.record("useAction", { action: "beast-form", choice: "Claws" });
    expect(l.character.toggles).toContain("beast-claws");
    l.record("useAction", { action: "beast-form", choice: "Tail" });
    expect(l.character.toggles).toContain("beast-tail");
    expect(l.character.toggles).not.toContain("beast-claws");
    l.record("toggle", { name: "raging", on: false });
    expect(l.character.toggles.some((x) => x.startsWith("beast-"))).toBe(false);
  });
});
