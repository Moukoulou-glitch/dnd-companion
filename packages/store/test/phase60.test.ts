import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { composeD20, rollComposed } from "@dnd/dice";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { zeroHpOptions } from "../src/zeroHp.js";

const reg = tableRegistry();
let t = 1_798_000_000_000;
const make = (cls: string, level: number, subclass?: string, extra: (c: ReturnType<typeof newCharacter>) => void = () => {}) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: cls, abilities: { str: 16, dex: 14, con: 14, int: 16, wis: 14, cha: 14 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, ...(subclass ? { subclass } : {}) };
  extra(c);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("11b: uses that come back when you roll initiative", () => {
  it("Relentless: a superiority die back, only with none left, on the combat's first initiative", () => {
    const l = make("class:fighter", 15, "subclass:battle-master");
    l.character.resourcesUsed["superiority-dice"] = 6;
    l.record("startCombat", {});
    expect(l.record("setInitiative", { value: 14 }).join(" ")).toMatch(/Relentless: 1 Superiority Dice back/i);
    expect(l.character.resourcesUsed["superiority-dice"]).toBe(5);
    l.record("spendResource", { resource: "superiority-dice", amount: 1 });
    l.record("setInitiative", { value: 15 });
    expect(l.character.resourcesUsed["superiority-dice"]).toBe(6);
  });
  it("Perfect Self: 4 ki", () => {
    const l = make("class:monk", 20, "subclass:open-hand");
    l.character.resourcesUsed.ki = 20;
    l.record("startCombat", {});
    l.record("setInitiative", { value: 10 });
    expect(l.character.resourcesUsed.ki).toBe(16);
  });
});

describe("11b: recovering slots and healing with them", () => {
  it("Natural Recovery: half the druid level in slot levels; more is noted, still done", () => {
    const l = make("class:druid", 6, "subclass:land");
    const a = derive(l.character, reg).actions.find((x) => x.id === "natural-recovery")!;
    expect(a.recoversSlots).toEqual({ budget: 3, maxLevel: 5 });
    l.character.slotsUsed = { "1": 2, "2": 1, "3": 1 };
    expect(l.record("useAction", { action: "natural-recovery", slots: [2, 1] }).join(" ")).toMatch(/Slots back: level 2, level 1/);
    expect(l.character.slotsUsed).toMatchObject({ "1": 1, "2": 0 });
    l.character.resourcesUsed["natural-recovery"] = 0;
    expect(l.record("useAction", { action: "natural-recovery", slots: [3, 1] }).join(" ")).toMatch(/allows 3\. Kept/);
  });
  it("Arcane Recovery uses the same picker", () => {
    expect(derive(make("class:wizard", 5).character, reg).actions.find((x) => x.id === "arcane-recovery")?.recoversSlots?.budget).toBe(3);
  });
  it("Combat Wild Shape spends the slot; the healing is its own heal", () => {
    const l = make("class:druid", 4, "subclass:circle-of-the-moon");
    expect(derive(l.character, reg).actions.find((x) => x.id === "combat-wild-shape-heal")?.slotHeal).toEqual({ die: "1d8" });
    const notes = l.record("useAction", { action: "combat-wild-shape-heal", slot: 2, rolled: 9 });
    expect(l.character.slotsUsed["2"]).toBe(1);
    expect(notes.join(" ")).toMatch(/Wild Shape form/);
  });
});

describe("11b: luck and resilience", () => {
  it("Dark One's Own Luck: a d10 on checks and saves that spends its use", () => {
    const s = derive(make("class:warlock", 6, "subclass:fiend").character, reg);
    const luck = s.saves.wis.suggestions.find((x) => x.label === "Dark One's Own Luck")!;
    expect(luck.apply.dice).toEqual(["1d10"]);
    expect(luck.spends).toEqual({ resource: "dark-ones-own-luck", amount: 1 });
    expect(s.resources.find((r) => r.id === "dark-ones-own-luck")?.reset).toBe("short");
  });
  it("Stroke of Luck: a check's d20 counts as 20; a miss-to-hit action", () => {
    const s = derive(make("class:rogue", 20, "subclass:thief").character, reg);
    const stroke = s.skills.stealth.suggestions.find((x) => x.label === "Stroke of Luck")!;
    const r = rollComposed(composeD20(s.skills.stealth, { enabled: ["Stroke of Luck"], manual: "none", extra: 0 }), [3]);
    expect(r.result.total).toBe(20 + s.skills.stealth.total);
    expect(stroke.spends?.resource).toBe("stroke-of-luck");
    expect(s.actions.some((a) => a.id === "stroke-of-luck")).toBe(true);
  });
  it("Fiendish Resilience: the type picked, replaced by the next pick", () => {
    const l = make("class:warlock", 10, "subclass:fiend");
    l.record("useAction", { action: "fiendish-resilience", choice: "fire" });
    expect(derive(l.character, reg).defenses.resist).toContain("fire");
    l.record("useAction", { action: "fiendish-resilience", choice: "cold" });
    const d = derive(l.character, reg).defenses.resist;
    expect(d).toContain("cold");
    expect(d).not.toContain("fire");
  });
  it("Relentless Rage: asked while raging, the DC rises 5 each use", () => {
    const l = make("class:barbarian", 11, "subclass:berserker");
    l.character.toggles.push("raging");
    l.character.hp.current = 5;
    expect(zeroHpOptions(l.character, { amount: 8 }, reg).rage).toEqual({ dc: 10 });
    expect(l.record("damage", { amount: 8, rage: { saved: true, total: 14 } }).join(" ")).toMatch(/DC 10 succeeds.*Next time it's DC 15/);
    expect(l.character.hp.current).toBe(1);
    expect(zeroHpOptions(l.character, { amount: 8 }, reg).rage).toEqual({ dc: 15 });
    l.character.toggles = [];
    expect(zeroHpOptions(l.character, { amount: 8 }, reg).rage).toBeUndefined();
  });
  it("Survivor: 5 + Con at the start of your turn at half HP or less", () => {
    const l = make("class:fighter", 18, "subclass:champion");
    const max = derive(l.character, reg).hpMax.total;
    l.character.hp.current = Math.floor(max / 2);
    l.record("startTurn", {});
    expect(l.character.hp.current).toBe(Math.floor(max / 2) + 7);
    l.record("startTurn", {});
    expect(l.character.hp.current).toBe(Math.floor(max / 2) + 7);
  });
});

describe("11b: spells", () => {
  it("Spell Mastery: at will at its own level, slots above it; Signature Spell: free once per short rest", () => {
    const l = make("class:wizard", 20, "subclass:school-of-conjuration", (c) => {
      c.choices["feature:spell-mastery"] = { first: ["spell:shield"], second: ["spell:misty-step"] };
      c.choices["feature:signature-spell"] = { first: ["spell:fireball"], second: ["spell:counterspell"] };
    });
    const s = derive(l.character, reg);
    const shield = s.spells.find((x) => x.id === "spell:shield")!;
    expect(shield.cast.atWill).toBe(true);
    expect(shield.cast.slotLevels[0]).toBe(2);
    const fb = s.spells.find((x) => x.id === "spell:fireball")!;
    expect(fb.cast.free?.resource).toBe("signature-spell-1");
    expect(fb.ready).toBe("always");
    expect(s.resources.find((r) => r.id === "signature-spell-2")?.reset).toBe("short");
  });
  it("Spell Mastery and Signature Spells warn about a spell that isn't in the spellbook", () => {
    const l = make("class:wizard", 20, undefined, (c) => {
      c.choices["feature:spell-mastery"] = { first: ["spell:shield"], second: ["spell:misty-step"] };
      c.spells.push({ spell: "spell:shield", list: "wizard", prepared: true });
    });
    const w = derive(l.character, reg).warnings.join(" ");
    expect(w).toMatch(/Spell Mastery: Misty Step isn't in your spellbook/);
    expect(w).not.toMatch(/Shield isn't/);
  });
});

describe("11b: summoned creatures", () => {
  it("Durable Summons: 30 temporary HP from a conjuration spell, lost first; Focused Conjuration: no concentration save", () => {
    const l = make("class:wizard", 14, "subclass:school-of-conjuration");
    l.character.concentration = { spell: "spell:conjure-animals", name: "Conjure Animals", level: 3 };
    l.record("summon", { spell: "spell:conjure-animals", group: "g", creatures: [{ creature: "creature:wolf", count: 1 }], concentration: true });
    const w = l.character.summons[0]!;
    expect(w.temp).toBe(30);
    l.record("summonHp", { id: w.id, damage: 35, type: "piercing" });
    expect(l.character.summons[0]!.temp).toBeUndefined();
    expect(l.character.summons[0]!.hp).toBe(6);
    expect(l.record("damage", { amount: 6 }).join(" ")).toMatch(/Focused Conjuration/);
    expect(l.lastPrompts.some((p) => p.kind === "concentration")).toBe(false);
  });
  it("Mighty Summoner: 2 more HP per Hit Die for beasts", () => {
    const l = make("class:druid", 6, "subclass:circle-of-the-shepherd");
    l.record("summon", { spell: "spell:conjure-animals", group: "g", creatures: [{ creature: "creature:wolf", count: 2 }] });
    expect(l.character.summons.map((m) => m.hp)).toEqual([15, 15]);
    expect(l.character.summons.some((m) => m.temp)).toBe(false);
  });
});
