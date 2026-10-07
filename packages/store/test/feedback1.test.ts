import { describe, expect, it } from "vitest";
import { derive, turnWarnings } from "@dnd/engine";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
function logFor(name: string) {
  let t = 1_700_000_000_000;
  return new CharacterLog(loadCharacter(name), reg, new HybridClock("test", () => (t += 1000)), "player");
}
const sheetOf = (log: CharacterLog) => derive(log.character, reg);

describe("timers", () => {
  it("Rage runs 10 rounds, counted at the end of each turn, then switches itself off", () => {
    const log = logFor("agaklis");
    log.record("useAction", { action: "rage" });
    expect(log.character.toggles).toContain("raging");
    expect(log.character.effects.find((e) => e.custom?.name === "Rage")).toMatchObject({ rounds: 10, toggles: ["raging"] });
    for (let i = 0; i < 9; i++) log.record("endTurn", {});
    expect(log.character.toggles).toContain("raging");
    log.record("endTurn", {});
    expect(log.character.toggles).not.toContain("raging");
  });

  it("Just activate switches Rage on without spending a use or the bonus action", () => {
    const log = logFor("agaklis");
    log.record("startCombat", {});
    log.record("startTurn", {});
    log.record("useAction", { action: "rage", free: true });
    expect(log.character.toggles).toContain("raging");
    expect(log.character.resourcesUsed.rage ?? 0).toBe(0);
    expect(log.character.combat!.bonus).toBe(0);
  });

  it("1-minute concentration counts rounds; Mage Armor counts hours and a long rest ends it", () => {
    const log = logFor("aristotelis");
    log.record("castSpell", { spell: "spell:flaming-sphere", list: "wizard", level: 2, using: "slot" });
    expect(log.character.concentration).toMatchObject({ name: "Flaming Sphere", level: 2, rounds: 10 });
    log.record("endTurn", {});
    expect(log.character.concentration!.rounds).toBe(9);
    log.record("passTime", { minutes: 1 });
    expect(log.character.concentration).toBeUndefined();

    log.record("castSpell", { spell: "spell:mage-armor", list: "wizard", level: 1, using: "slot", selfEffect: true });
    const armor = log.character.effects.find((e) => e.effect === "effect:mage-armor" && e.minutes !== undefined)!;
    expect(armor.minutes).toBe(480);
    log.record("rest", { kind: "short" });
    expect(log.character.effects.find((e) => e.id === armor.id)!.minutes).toBe(420);
    log.record("rest", { kind: "long" });
    expect(log.character.effects.find((e) => e.id === armor.id)).toBeUndefined();
  });

  it("Flaming Sphere now has its save from the SRD text", () => {
    const sp = sheetOf(logFor("aristotelis")).spells.find((s) => s.id === "spell:flaming-sphere")!;
    expect(sp.save).toEqual({ ability: "dex", dc: 14, onSuccess: "half" });
    expect(sp.damage!.byLevel[3]).toBe("3d6");
  });
});

describe("effects cast on you", () => {
  it("Aid at 3rd level: +10 HP maximum and current HP", () => {
    const log = logFor("beren");
    log.record("addEffect", { instanceId: "aid", effect: "effect:aid", castLevel: 3 });
    expect(sheetOf(log).hpMax.total).toBe(46);
    expect(log.character.hp.current).toBe(46);
    log.record("updateEffect", { instanceId: "aid", castLevel: 2 });
    expect(sheetOf(log).hpMax.total).toBe(41);
    expect(log.character.hp.current).toBe(41);
  });

  it("Hexed: the chosen ability's checks have disadvantage, skills included", () => {
    const log = logFor("beren");
    log.record("addEffect", { instanceId: "hex", effect: "effect:hexed" });
    expect(sheetOf(log).skills.athletics.disadvantage).toEqual([]);
    log.record("updateEffect", { instanceId: "hex", choice: "str" });
    const s = sheetOf(log);
    expect(s.skills.athletics.disadvantage).toEqual(["Hexed"]);
    expect(s.saves.str.disadvantage).toEqual([]);
    expect(s.effects.find((e) => e.id === "effect:hexed")!.choice).toMatchObject({ value: "str" });
  });

  it("Invisibility on yourself makes you Invisible: advantage on attacks", () => {
    const log = logFor("elissaios");
    log.record("castSpell", { spell: "spell:invisibility", list: "haunted-by-the-shadows", level: 2, using: "free", selfEffect: true });
    expect(sheetOf(log).attacks[0]!.attack.advantage).toContain("Invisible (Invisibility)");
  });
});

describe("rolls kept and rolled", () => {
  it("Portent: record the foretelling rolls, spend them one at a time, lose them on a long rest", () => {
    const log = logFor("aristotelis");
    const before = sheetOf(log).resources.find((r) => r.id === "portent")!;
    expect(before.pool).toEqual({ sides: 20, values: [] });
    log.record("setPool", { resource: "portent", values: [3, 17] });
    log.record("usePool", { resource: "portent", index: 1 });
    const after = sheetOf(log).resources.find((r) => r.id === "portent")!;
    expect(after).toMatchObject({ remaining: 1, pool: { values: [3] } });
    log.record("rest", { kind: "long" });
    expect(sheetOf(log).resources.find((r) => r.id === "portent")!.pool!.values).toEqual([]);
  });

  it("Spirit Shield rolls 2d6; Psychic Whispers turns its roll into hours", () => {
    expect(sheetOf(logFor("agaklis")).actions.find((a) => a.id === "spirit-shield")!.roll).toMatchObject({ dice: ["2d6"], label: "damage prevented" });
    const log = logFor("elissaios");
    const pw = sheetOf(log).actions.find((a) => a.id === "psychic-whispers")!;
    expect(pw.roll!.dice).toEqual(["1d8"]);
    log.record("useAction", { action: "psychic-whispers", rolled: 5 });
    expect(log.character.effects.find((e) => e.custom?.name === "Psychic Whispers")!.minutes).toBe(300);
  });

  it("Ancestral Protectors reminds on damage while raging", () => {
    const log = logFor("agaklis");
    const hammer = () => sheetOf(log).attacks.find((a) => a.mode === "melee")!;
    expect(hammer().damage.bonus.notes).toBeUndefined();
    log.record("toggle", { name: "raging", on: true });
    expect(hammer().damage.bonus.notes![0]).toMatch(/^Ancestral Protectors/);
  });

  it("Eldritch Blast: two beams for a 9th-level character", () => {
    const eb = sheetOf(logFor("elissaios")).spells.find((s) => s.id === "spell:eldritch-blast")!;
    expect(eb.beams).toEqual({ byLevel: { 0: 2 }, what: "beams" });
  });
});

describe("turn rules", () => {
  it("Steady Aim after moving warns; using it stops your movement; it isn't used twice", () => {
    const log = logFor("elissaios");
    log.record("startCombat", {});
    log.record("setInitiative", { value: 17 });
    log.record("startTurn", {});
    expect(log.character.combat!.initiative).toBe(17);
    log.record("useEconomy", { kind: "move", amount: 10 });
    const intent = { name: "Steady Aim", economy: "bonus" as const, notAfterMoving: true, actionId: "steady-aim" };
    expect(turnWarnings(log.character, sheetOf(log), intent)).toEqual(["You've moved 10 ft this turn: Steady Aim only works if you haven't moved."]);
    const notes = log.record("useAction", { action: "steady-aim" });
    expect(notes[0]).toMatch(/You had moved 10 ft/);
    expect(log.character.combat!.moved).toBe(sheetOf(log).speed.total);
    expect(turnWarnings(log.character, sheetOf(log), intent)).toContain("You've already used Steady Aim this turn.");
  });

  it("Charm of Sunlight is a campaign feature for Αγακλής and Αριστοτέλης", () => {
    for (const name of ["agaklis", "aristotelis"]) {
      const s = sheetOf(logFor(name));
      expect(s.features.map((f) => f.name)).toContain("Φυλαχτό του Ηλιακού Φωτός (Charm of Sunlight)");
      expect(s.actions.map((a) => a.id)).toEqual(expect.arrayContaining(["charm-of-sunlight", "charm-of-sunlight-join"]));
    }
  });
});

describe("second round of table feedback", () => {
  it("Regain a Psionic Energy die gives one back, once per long rest", () => {
    const log = logFor("elissaios");
    const dice = () => sheetOf(log).resources.find((r) => r.id === "psionic-energy")!.remaining;
    const before = dice();
    log.record("useAction", { action: "psionic-recover" });
    expect(dice()).toBe(before + 1);
    expect(sheetOf(log).resources.find((r) => r.id === "psionic-recover")!.remaining).toBe(0);
  });

  it("the second Psychic Blade needs a Psychic Blade attack first this turn", () => {
    const log = logFor("elissaios");
    log.record("startCombat", {});
    log.record("startTurn", {});
    const s = sheetOf(log);
    const bonus = s.attacks.find((a) => a.attackId === "attack:psychic-blade-bonus" && a.mode === "melee")!;
    const intent = { name: bonus.name, economy: "bonus" as const, weapon: { attackId: bonus.attackId, light: false, requires: bonus.requires! } };
    expect(turnWarnings(log.character, s, intent)[0]).toMatch(/after you've attacked with a Psychic Blade/);
    log.record("useEconomy", { kind: "attack", attackWith: { attackId: "attack:psychic-blade", melee: true, light: false } });
    expect(turnWarnings(log.character, sheetOf(log), intent)).toEqual([]);
  });

  it("off-hand attacks: no ability modifier, light weapons only, unless Dual Wielder", () => {
    const beren = sheetOf(logFor("beren"));
    const offSword = beren.attacks.find((a) => a.offHand && a.name.startsWith("Shortsword"))!;
    expect(offSword.name).toBe("Shortsword (off-hand)");
    expect(offSword.action).toBe("bonus");
    expect(offSword.damage.bonus.total).toBe(0);

    const log = logFor("agaklis");
    log.record("startCombat", {});
    log.record("startTurn", {});
    const s = sheetOf(log);
    expect(s.rules.twoWeaponNonLight).toBe(true);
    const off = s.attacks.find((a) => a.offHand)!;
    const intent = { name: off.name, economy: "bonus" as const, weapon: { attackId: off.attackId, itemInstanceId: off.itemInstanceId!, offHand: true, light: false } };
    expect(turnWarnings(log.character, s, intent)).toEqual(["Two-weapon fighting: first attack with a melee weapon in your other hand, using the Attack action."]);
    const other = s.attacks.find((a) => !a.offHand && a.mode === "melee" && a.itemInstanceId && a.itemInstanceId !== off.itemInstanceId)!;
    log.record("useEconomy", { kind: "attack", attackWith: { attackId: other.attackId, itemInstanceId: other.itemInstanceId!, melee: true, light: false } });
    expect(turnWarnings(log.character, sheetOf(log), intent)).toEqual([]);
    expect(off.damage.bonus.suggestions.map((x) => x.label)).toContain("Dual Wielder (off-hand)");
  });

  it("Hold Person on you brings Paralyzed, and with it Incapacitated", () => {
    const log = logFor("beren");
    log.record("addEffect", { instanceId: "hp", effect: "effect:hold-person" });
    const e = sheetOf(log).effects[0]!;
    expect(e.includes.map((x) => x.name)).toEqual(["Paralyzed", "Incapacitated"]);
    expect(turnWarnings(log.character, sheetOf(log), { name: "Attack", economy: "action" })[0]).toMatch(/can't take actions/);
    expect(sheetOf(log).saves.dex.autoFail).toBeDefined();
  });

  it("caster-only effects are marked so they stay out of Add an effect", () => {
    expect(reg.get("effect:hex", "effect").selfOnly).toBe(true);
    expect(reg.get("effect:hexed", "effect").selfOnly).toBeUndefined();
  });

  it("free casts point at their spell; Form of Dread runs 10 rounds with its reminder", () => {
    const log = logFor("elissaios");
    expect(sheetOf(log).actions.find((a) => a.id === "haunted-invisibility")!.spells).toEqual([{ id: "spell:invisibility", list: "haunted-by-the-shadows" }]);
    log.record("useAction", { action: "form-of-dread", rolled: 7 });
    expect(log.character.effects.find((e) => e.custom?.name === "Form of Dread")).toMatchObject({ rounds: 10, toggles: ["form-of-dread"] });
    expect(sheetOf(log).attacks[0]!.attack.notes![0]).toMatch(/^Form of Dread/);
  });

  it("concentration time can be changed by hand", () => {
    const log = logFor("beren");
    log.record("castSpell", { spell: "spell:entangle", list: "ranger", level: 1, using: "slot" });
    log.record("setConcentration", { rounds: 4 });
    expect(log.character.concentration!.rounds).toBe(4);
    log.record("setConcentration", { rounds: 0 });
    expect(log.character.concentration).toBeUndefined();
  });

  it("Exhaustion knows what each level does", () => {
    expect(reg.get("condition:exhaustion", "effect").levelNotes![2]).toBe("Disadvantage on attack rolls and saving throws");
  });
});
