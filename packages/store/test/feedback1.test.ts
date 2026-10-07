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
