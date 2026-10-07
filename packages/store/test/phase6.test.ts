import { describe, expect, it } from "vitest";
import { derive, turnReminders, turnWarnings } from "@dnd/engine";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
function logFor(name: string) {
  let t = 1_700_000_000_000;
  return new CharacterLog(loadCharacter(name), reg, new HybridClock("test", () => (t += 1000)), "player");
}
const sheetOf = (log: CharacterLog) => derive(log.character, reg);

describe("turns in combat", () => {
  it("start combat, start turn, use parts of the turn, end turn, next round", () => {
    const log = logFor("agaklis");
    log.record("startCombat", {});
    expect(log.character.combat).toMatchObject({ round: 1, myTurn: false });
    log.record("startTurn", {});
    expect(log.character.combat).toMatchObject({ round: 1, myTurn: true, action: 0 });

    log.record("useAction", { action: "rage" });
    expect(log.character.combat!.bonus).toBe(1);

    // Extra Attack: two attacks for one action.
    expect(sheetOf(log).attacksPerAction).toBe(2);
    log.record("useEconomy", { kind: "attack" });
    log.record("useEconomy", { kind: "attack" });
    expect(log.character.combat).toMatchObject({ action: 1, attacks: 2 });
    expect(turnWarnings(log.character, sheetOf(log), { name: "Warhammer", economy: "action", attack: true })).toEqual([
      "You've made 2 of 2 attacks for your Attack action this turn.",
    ]);
    expect(turnWarnings(log.character, sheetOf(log), { name: "Rage", economy: "bonus" })).toEqual(["You've already used your bonus action this turn."]);

    log.record("useEconomy", { kind: "move", amount: 25 });
    expect(log.character.combat!.moved).toBe(25);

    log.record("endTurn", {});
    expect(log.character.combat!.myTurn).toBe(false);
    expect(turnWarnings(log.character, sheetOf(log), { name: "Attack", economy: "action", attack: true })[0]).toMatch(/isn't your turn/);

    log.record("startTurn", {});
    expect(log.character.combat).toMatchObject({ round: 2, myTurn: true, action: 0, bonus: 0, attacks: 0, moved: 0 });

    log.record("endCombat", {});
    expect(log.character.combat).toBeUndefined();
  });

  it("taking back the only attack gives the action back", () => {
    const log = logFor("agaklis");
    log.record("startCombat", {});
    log.record("startTurn", {});
    log.record("useEconomy", { kind: "attack" });
    log.record("useEconomy", { kind: "attack", amount: -1 });
    expect(log.character.combat).toMatchObject({ action: 0, attacks: 0 });
  });

  it("2014 spell rule: after a bonus-action spell, only an action cantrip", () => {
    const log = logFor("elissaios");
    log.record("startCombat", {});
    log.record("startTurn", {});
    log.record("castSpell", { spell: "spell:hex", list: "warlock", level: 1, using: "pact" });
    expect(log.character.combat).toMatchObject({ bonus: 1, bonusSpell: true });
    const sheet = sheetOf(log);
    expect(turnWarnings(log.character, sheet, { name: "Cause Fear", economy: "action", spell: { level: 1, concentration: true } })).toEqual([
      "You're concentrating on Hex: casting Cause Fear ends it.",
      "You've cast a bonus-action spell this turn: the only other spell you can cast is a cantrip with a casting time of 1 action.",
    ]);
    expect(turnWarnings(log.character, sheet, { name: "Eldritch Blast", economy: "action", spell: { level: 0, concentration: false } })).toEqual([]);
  });

  it("raging blocks spells; incapacitating conditions block actions (warnings only)", () => {
    const log = logFor("agaklis");
    log.record("toggle", { name: "raging", on: true });
    expect(turnWarnings(log.character, sheetOf(log), { name: "Spell", economy: "action", spell: { level: 1, concentration: false } })).toContain(
      "You can't cast spells while raging.",
    );
    log.record("addEffect", { instanceId: "s1", effect: "condition:stunned" });
    expect(turnWarnings(log.character, sheetOf(log), { name: "Attack", economy: "action" })).toContain("You're stunned: you can't take actions or reactions.");
    expect(turnReminders(log.character, sheetOf(log))[0]).toMatch(/^Raging/);
  });
});

describe("Μπέρεν's Primal Companion", () => {
  it("asks for a form first, then gives the stat block with Μπέρεν's numbers", () => {
    const log = logFor("beren");
    const before = sheetOf(log).companions[0]!;
    expect(before).toMatchObject({ id: "primal-beast", source: "Primal Companion" });
    expect(before.form).toBeUndefined();
    expect(before.forms.map((f) => f.name)).toEqual(["Beast of the Land", "Beast of the Sea", "Beast of the Sky"]);

    log.record("setCompanion", { companion: "primal-beast", form: "land", name: "Λύκος" });
    const beast = sheetOf(log).companions[0]!;
    expect(beast.name).toBe("Λύκος");
    expect(beast.form!.ac.total).toBe(15); // 13 + PB 2
    expect(beast.form!.hpMax.total).toBe(25); // 5 + 5 × 4 ranger levels
    expect(beast.form!.attacks[0]).toMatchObject({ name: "Maul", attack: { total: 5 }, damage: { dice: "1d8", type: "slashing", bonus: { total: 4 } } });
    expect(beast.form!.abilities.dex.save.total).toBe(4); // +2 Dex, +2 Primal Bond
    expect(beast.form!.saveDc).toBe(13);

    log.record("setCompanion", { companion: "primal-beast", form: "sky" });
    expect(sheetOf(log).companions[0]!.form).toMatchObject({ hpMax: { total: 20 }, attacks: [{ name: "Shred", damage: { dice: "1d4", bonus: { total: 5 } } }] });
  });

  it("takes damage, dies at 0, comes back with a spell slot, heals on a long rest", () => {
    const log = logFor("beren");
    log.record("setCompanion", { companion: "primal-beast", form: "land" });
    log.record("damage", { amount: 10, companion: "primal-beast" });
    expect(sheetOf(log).companions[0]!.form!.hp.current).toBe(15);
    expect(log.character.hp.current).toBe(36); // Μπέρεν himself untouched
    expect(log.record("damage", { amount: 30, companion: "primal-beast" }).join(" ")).toMatch(/dies/);
    log.record("heal", { amount: 5, companion: "primal-beast" });
    expect(sheetOf(log).companions[0]!.form!.hp.current).toBe(0);
    log.record("reviveCompanion", { companion: "primal-beast", level: 1 });
    expect(sheetOf(log).companions[0]!.form!.hp.current).toBe(25);
    expect(log.character.slotsUsed["1"]).toBe(1);
    log.record("damage", { amount: 7, companion: "primal-beast" });
    log.record("rest", { kind: "long" });
    expect(sheetOf(log).companions[0]!.form!.hp.current).toBe(25);
  });
});
