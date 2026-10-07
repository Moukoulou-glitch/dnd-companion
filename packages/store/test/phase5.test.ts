import { describe, expect, it } from "vitest";
import { derive } from "@dnd/engine";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
function logFor(name: string) {
  let t = 1_700_000_000_000;
  return new CharacterLog(loadCharacter(name), reg, new HybridClock("test", () => (t += 1000)), "player");
}
const sheetOf = (log: CharacterLog) => derive(log.character, reg);
const spell = (log: CharacterLog, id: string) => sheetOf(log).spells.find((s) => s.id === `spell:${id}`)!;

describe("SRD spell text", () => {
  it("keeps the SRD wording, with ability names capitalized as published", () => {
    const fireball = reg.get("spell:fireball", "spell");
    expect(fireball.text[0]).toContain("must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save");
    expect(fireball.source.book).toBe("SRD 5.1");
    expect(reg.list("spell").filter((s) => s.source.pack === "srd-5.1")).toHaveLength(319);
  });
});

describe("each character's spells", () => {
  it("Αριστοτέλης: wizard spellbook, Fey Touched and Infernal Legacy spells, DC 14 / +6", () => {
    const log = logFor("aristotelis");
    const s = sheetOf(log);
    expect(s.spells.filter((x) => x.list.id === "wizard")).toHaveLength(22);
    expect(spell(log, "magic-missile").ready).toBe("not prepared");
    expect(spell(log, "ray-of-frost").ready).toBe("always");
    expect(spell(log, "misty-step").list.id).toBe("fey-touched");
    expect(spell(log, "misty-step").cast.free?.name).toBe("Fey Touched: Misty Step");
    expect(spell(log, "dissonant-whispers").cast.free?.name).toBe("Fey Touched: 1st-level spell");
    expect(spell(log, "hellish-rebuke").save).toEqual({ ability: "dex", dc: 10, onSuccess: "half" });
    expect(spell(log, "ray-of-frost").attack!.total).toBe(6);
    expect(s.spellcasting.find((x) => x.id === "wizard")!.prepared).toEqual({ count: 0, max: 8 });
  });

  it("cantrip damage scales with character level; upcast damage by slot", () => {
    expect(spell(logFor("aristotelis"), "ray-of-frost").damage).toEqual({ type: "cold", byLevel: { 0: "1d8" } });
    expect(spell(logFor("elissaios"), "chill-touch").damage!.byLevel[0]).toBe("2d8");
    const mm = spell(logFor("aristotelis"), "magic-missile").damage!.byLevel;
    expect([mm[1], mm[2], mm[3]]).toEqual(["3d4+3", "4d4+4", "5d4+5"]);
    expect(spell(logFor("aristotelis"), "magic-missile").cast.slotLevels).toEqual([1, 2]);
  });

  it("healing adds the spellcasting modifier: Μπέρεν's Cure Wounds is 1d8+3", () => {
    const cw = spell(logFor("beren"), "cure-wounds");
    expect(cw.heal!.byLevel[1]).toBe("1d8+3");
    expect(cw.ready).toBe("always");
  });

  it("Ελισσαίος casts warlock spells with his Pact slot; Eldritch Blast uses Charisma", () => {
    const log = logFor("elissaios");
    expect(spell(log, "hex").cast).toEqual({ slotLevels: [], pact: { level: 1, remaining: 1 } });
    expect(spell(log, "eldritch-blast").attack!.total).toBe(7);
    expect(spell(log, "invisibility").cast.free?.name).toBe("Haunted: Invisibility");
  });

  it("Bless on the caster also applies to spell attacks", () => {
    const log = logFor("aristotelis");
    log.record("addEffect", { instanceId: "b", effect: "effect:bless" });
    expect(spell(log, "ray-of-frost").attack!.dice).toEqual([{ label: "Bless", dice: "1d4" }]);
  });

  it("placeholder spells are marked as missing their text", () => {
    expect(spell(logFor("elissaios"), "hex").placeholder).toBe(true);
    expect(spell(logFor("elissaios"), "eldritch-blast").placeholder).toBe(false);
  });
});

describe("casting", () => {
  it("spends a slot of the level chosen (upcasting)", () => {
    const log = logFor("aristotelis");
    log.record("castSpell", { spell: "spell:magic-missile", list: "wizard", level: 2, using: "slot" });
    expect(log.character.slotsUsed).toEqual({ "2": 1 });
  });

  it("casting a spell that isn't prepared warns but still casts", () => {
    const log = logFor("aristotelis");
    expect(log.record("castSpell", { spell: "spell:magic-missile", list: "wizard", level: 1, using: "slot" })).toEqual([
      "Magic Missile isn't prepared today.",
    ]);
    log.record("setPrepared", { spell: "spell:magic-missile", list: "wizard", prepared: true });
    expect(log.record("castSpell", { spell: "spell:magic-missile", list: "wizard", level: 1, using: "slot" })).toEqual([]);
  });

  it("preparing more than allowed is noted", () => {
    const log = logFor("aristotelis");
    const ids = ["alarm", "comprehend-languages", "detect-magic", "feather-fall", "find-familiar", "identify", "mage-armor", "magic-missile"];
    for (const id of ids) log.record("setPrepared", { spell: `spell:${id}`, list: "wizard", prepared: true });
    expect(log.record("setPrepared", { spell: "spell:shield", list: "wizard", prepared: true })).toEqual(["9 spells prepared; Wizard can prepare 8."]);
  });

  it("a free use spends the feature's pool, not a slot", () => {
    const log = logFor("aristotelis");
    log.record("castSpell", { spell: "spell:misty-step", list: "fey-touched", level: 2, using: "free" });
    expect(log.character.resourcesUsed["fey-touched-misty-step"]).toBe(1);
    expect(log.character.slotsUsed).toEqual({});
  });

  it("Pact slots are spent and come back on a short rest", () => {
    const log = logFor("elissaios");
    log.record("castSpell", { spell: "spell:hex", list: "warlock", level: 1, using: "pact" });
    expect(log.character.pactSlotsUsed).toBe(1);
    expect(log.record("castSpell", { spell: "spell:armor-of-agathys", list: "warlock", level: 1, using: "pact" })).toEqual([
      "No Pact Magic slots left. Cast anyway.",
    ]);
  });

  it("Shield cast on yourself adds its effect: AC 15 → 20", () => {
    const log = logFor("aristotelis");
    log.record("castSpell", { spell: "spell:shield", list: "wizard", level: 1, using: "slot", selfEffect: true });
    expect(sheetOf(log).ac.total).toBe(20);
  });
});

describe("concentration (2014)", () => {
  it("casting a concentration spell starts concentration", () => {
    const log = logFor("beren");
    log.record("castSpell", { spell: "spell:hunters-mark", list: "ranger", level: 1, using: "slot" });
    expect(log.character.concentration).toEqual({ spell: "spell:hunters-mark", name: "Hunter's Mark" });
  });

  it("a second concentration spell ends the first, and its self effect", () => {
    const log = logFor("aristotelis");
    log.record("addEffect", { instanceId: "x", effect: "condition:prone" });
    log.record("castSpell", { spell: "spell:invisibility", list: "wizard", level: 2, using: "slot", selfEffect: true });
    expect(sheetOf(log).effects.map((e) => e.name)).toEqual(["Mage Armor", "Prone"]);
    expect(log.record("castSpell", { spell: "spell:web", list: "wizard", level: 2, using: "slot" })).toEqual([
      "Web isn't prepared today.",
      "Casting Web. Concentration on Invisibility ended.",
    ]);
    expect(log.character.concentration?.name).toBe("Web");
  });

  it("damage asks for a check: DC 10, or half the damage if higher", () => {
    const log = logFor("beren");
    log.record("castSpell", { spell: "spell:hunters-mark", list: "ranger", level: 1, using: "slot" });
    log.record("damage", { amount: 7 });
    expect(log.lastPrompts).toEqual([{ kind: "concentration", dc: 10, spell: "Hunter's Mark" }]);
    log.record("damage", { amount: 25 });
    expect(log.lastPrompts).toEqual([{ kind: "concentration", dc: 12, spell: "Hunter's Mark" }]);
  });

  it("the DC uses damage after resistance, and no damage means no check", () => {
    const log = logFor("aristotelis");
    log.record("castSpell", { spell: "spell:web", list: "wizard", level: 2, using: "slot" });
    log.record("damage", { amount: 24, damageType: "fire" });
    expect(log.lastPrompts[0]!.dc).toBe(10);
    log.record("damage", { amount: 0 });
    expect(log.lastPrompts).toEqual([]);
  });

  it("temporary HP still count as damage taken", () => {
    const log = logFor("beren");
    log.record("castSpell", { spell: "spell:hunters-mark", list: "ranger", level: 1, using: "slot" });
    log.record("setTempHp", { amount: 30 });
    log.record("damage", { amount: 24 });
    expect(log.lastPrompts[0]!.dc).toBe(12);
  });

  it("dropping to 0 HP or becoming incapacitated ends it", () => {
    const log = logFor("beren");
    log.record("castSpell", { spell: "spell:hunters-mark", list: "ranger", level: 1, using: "slot" });
    expect(log.record("damage", { amount: 40 })[0]).toBe("Dropped to 0 HP. Concentration on Hunter's Mark ended.");
    expect(log.character.concentration).toBeUndefined();

    const log2 = logFor("beren");
    log2.record("castSpell", { spell: "spell:hunters-mark", list: "ranger", level: 1, using: "slot" });
    expect(log2.record("addEffect", { instanceId: "s", effect: "condition:stunned" })).toEqual(["Stunned. Concentration on Hunter's Mark ended."]);
  });

  it("a failed check ends it; undo brings it back", () => {
    const log = logFor("beren");
    log.record("castSpell", { spell: "spell:hunters-mark", list: "ranger", level: 1, using: "slot" });
    expect(log.record("endConcentration", {})).toEqual(["Concentration on Hunter's Mark ended."]);
    log.undo();
    expect(log.character.concentration?.name).toBe("Hunter's Mark");
  });
});

describe("older saves", () => {
  it("an effect saved as spell:bless by an earlier version still works as the Bless effect", () => {
    const log = logFor("beren");
    log.record("addEffect", { instanceId: "old", effect: "spell:bless" });
    expect(log.character.effects[0]!.effect).toBe("effect:bless");
    const c = { ...log.character, effects: [{ id: "x", effect: "spell:bless" }] };
    expect(derive(c, reg).effects[0]!.name).toBe("Bless");
  });
});
