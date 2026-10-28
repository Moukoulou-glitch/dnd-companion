import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const inv = (...items: [string, boolean?][]) => items.map(([item, attuned = true], i) => ({ id: `i${i}`, item, quantity: 1, equipped: true, attuned }));
const sheet = (classes: { class: string; level: number; subclass?: string }[], items: [string, boolean?][], abilities = { str: 10, dex: 14, con: 12, int: 16, wis: 14, cha: 16 }) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities, race: "race:human", classes, hp: { current: 30, temp: 0 }, inventory: inv(...items) }), reg);

describe("13e: SRD magic items' numbers", () => {
  it("protection: Cloak and Ring of Protection add up; Bracers only without armor or shield", () => {
    const bare = sheet([{ class: "class:wizard", level: 5 }], []);
    const both = sheet([{ class: "class:wizard", level: 5 }], [["item:cloak-of-protection"], ["item:ring-of-protection"]]);
    expect(both.ac.total - bare.ac.total).toBe(2);
    expect(both.saves.dex.total - bare.saves.dex.total).toBe(2);
    expect(sheet([{ class: "class:monk", level: 5 }], [["item:bracers-of-defense"]]).ac.total - sheet([{ class: "class:monk", level: 5 }], []).ac.total).toBe(2);
    expect(sheet([{ class: "class:fighter", level: 5 }], [["item:bracers-of-defense"], ["item:chain-mail", false]]).ac.total).toBe(sheet([{ class: "class:fighter", level: 5 }], [["item:chain-mail", false]]).ac.total);
  });
  it("an unattuned item does nothing", () => {
    expect(sheet([{ class: "class:wizard", level: 5 }], [["item:cloak-of-protection", false]]).ac.total).toBe(sheet([{ class: "class:wizard", level: 5 }], []).ac.total);
  });
  it("scores: Gauntlets, Belts, Ioun Stones", () => {
    const s = sheet([{ class: "class:fighter", level: 5 }], [["item:belt-of-fire-giant-strength"], ["item:ioun-stone-agility"], ["item:headband-of-intellect"]]);
    expect([s.abilities.str.score.total, s.abilities.dex.score.total, s.abilities.int.score.total]).toEqual([25, 17, 19]);
    expect(sheet([{ class: "class:fighter", level: 5 }], [["item:ioun-stone-mastery"]]).proficiencyBonus).toBe(4);
  });
  it("Ring of Resistance, Frost Brand, Sentinel Shield", () => {
    expect(sheet([{ class: "class:wizard", level: 5 }], [["item:ring-of-resistance-fire"]]).defenses.resist).toContain("fire");
    const fb = sheet([{ class: "class:fighter", level: 5 }], [["item:frost-brand-longsword"]]);
    expect(fb.defenses.resist).toContain("fire");
    expect(fb.attacks.find((a) => a.name === "Frost Brand")!.damage.bonus.dice.map((d) => d.dice)).toContain("1d6");
    expect(sheet([{ class: "class:fighter", level: 5 }], [["item:sentinel-shield"]]).initiative.advantage).toContain("Sentinel Shield");
  });
  it("magic weapons and armor: their bonus, Mithral's stealth, Sun Blade's radiant", () => {
    const sb = sheet([{ class: "class:paladin", level: 5 }], [["item:sun-blade"]]).attacks.find((a) => a.name === "Sun Blade")!;
    expect([sb.damage.type, sb.attack.parts.some((p) => p.label === "Magic weapon" && p.value === 2)]).toEqual(["radiant", true]);
    expect(reg.get("item:mithral-half-plate", "item").armor?.stealthDisadvantage).toBe(false);
  });
  it("Robe of the Archmagi: AC 15 + Dex, +2 to spell DC and attack", () => {
    const s = sheet([{ class: "class:wizard", level: 9 }], [["item:robe-of-the-archmagi"]]);
    const b = sheet([{ class: "class:wizard", level: 9 }], []);
    expect(s.ac.total).toBe(17);
    expect([s.spellcasting[0]!.saveDc.total - b.spellcasting[0]!.saveDc.total, s.spellcasting[0]!.attack.total - b.spellcasting[0]!.attack.total]).toEqual([2, 2]);
  });
});

describe("13e: caster foci for one class's spells", () => {
  it("Rod of the Pact Keeper +2: warlock spells only, and a slot back once per long rest", () => {
    const s = sheet([{ class: "class:warlock", level: 5 }, { class: "class:cleric", level: 1 }], [["item:rod-of-the-pact-keeper-2"]]);
    const b = sheet([{ class: "class:warlock", level: 5 }, { class: "class:cleric", level: 1 }], []);
    const wl = (x: typeof s) => x.spellcasting.find((c) => c.id === "warlock")!;
    const cl = (x: typeof s) => x.spellcasting.find((c) => c.id === "cleric")!;
    expect([wl(s).attack.total - wl(b).attack.total, wl(s).saveDc.total - wl(b).saveDc.total]).toEqual([2, 2]);
    expect(cl(s).attack.total).toBe(cl(b).attack.total);
    expect(s.actions.find((a) => a.id === "pact-keeper-2")?.cost?.resource).toBe("rod-of-the-pact-keeper-2");
  });
  it("Wand of the War Mage +1: any spell attack, not the DC; Moon Sickle +3: a +3 weapon too", () => {
    const s = sheet([{ class: "class:wizard", level: 5 }], [["item:wand-of-the-war-mage-1"]]);
    const b = sheet([{ class: "class:wizard", level: 5 }], []);
    expect([s.spellcasting[0]!.attack.total - b.spellcasting[0]!.attack.total, s.spellcasting[0]!.saveDc.total - b.spellcasting[0]!.saveDc.total]).toEqual([1, 0]);
    const d = sheet([{ class: "class:druid", level: 5 }], [["item:moon-sickle-3"]]);
    expect(d.attacks.find((a) => a.name === "Moon Sickle +3")!.attack.parts.find((p) => p.label === "Magic weapon")?.value).toBe(3);
    expect(d.spellcasting[0]!.saveDc.total).toBe(sheet([{ class: "class:druid", level: 5 }], []).spellcasting[0]!.saveDc.total + 3);
  });
  it("Rhythm-Maker's Drum gives back a Bardic Inspiration use", () => {
    expect(sheet([{ class: "class:bard", level: 3 }], [["item:rhythm-makers-drum-1"]]).actions.find((a) => a.id === "rhythm-1")).toMatchObject({ restores: { resource: "bardic-inspiration", amount: 1 } });
  });
});
