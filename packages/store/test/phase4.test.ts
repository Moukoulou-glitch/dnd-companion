import { describe, expect, it } from "vitest";
import { derive } from "@dnd/engine";
import { composeD20, formatFormula } from "../../dice/src/index.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let n = 0;
function logFor(name: string) {
  let t = 1_700_000_000_000;
  return new CharacterLog(loadCharacter(name), reg, new HybridClock("test", () => (t += 1000)), "player");
}
const add = (log: CharacterLog, effect: string, extra: object = {}) => log.record("addEffect", { instanceId: `e${++n}`, effect, ...extra });
const sheetOf = (log: CharacterLog) => derive(log.character, reg);
const bow = (log: CharacterLog) => sheetOf(log).attacks.find((a) => a.name === "Vicious Longbow")!;

describe("spell effects", () => {
  it("Bless adds 1d4 to attacks and saves, not to checks; a second Bless doesn't stack", () => {
    const log = logFor("beren");
    add(log, "spell:bless", { from: "Cleric" });
    add(log, "spell:bless");
    const s = sheetOf(log);
    expect(bow(log).attack.dice).toEqual([{ label: "Bless", dice: "1d4" }]);
    expect(s.saves.wis.dice).toEqual([{ label: "Bless", dice: "1d4" }]);
    expect(s.skills.perception.dice).toEqual([]);
    expect(formatFormula(composeD20(bow(log).attack).terms)).toBe("1d20+3+2+2+1d4");
  });

  it("Bane subtracts 1d4", () => {
    const log = logFor("beren");
    add(log, "spell:bane");
    expect(formatFormula(composeD20(bow(log).attack).terms)).toBe("1d20+3+2+2-1d4");
  });

  it("Haste: +2 AC, advantage on Dexterity saves, speed doubled", () => {
    const log = logFor("agaklis");
    add(log, "spell:haste");
    const s = sheetOf(log);
    expect(s.ac.total).toBe(17);
    expect(s.saves.dex.advantage).toEqual(["Haste"]);
    expect(s.speed.total).toBe(80);
    expect(s.speed.parts.at(-1)).toEqual({ label: "Haste (×2)", value: 40 });
  });

  it("Shield adds 5 AC; removing it takes the 5 away", () => {
    const log = logFor("aristotelis");
    add(log, "spell:shield");
    expect(sheetOf(log).ac.total).toBe(20);
    log.record("removeEffect", { instanceId: log.character.effects.at(-1)!.id });
    expect(sheetOf(log).ac.total).toBe(15);
  });

  it("Mage Armor ends: Αριστοτέλης drops to AC 12", () => {
    const log = logFor("aristotelis");
    log.record("removeEffect", { instanceId: "e-mage-armor" });
    expect(sheetOf(log).ac.total).toBe(12);
  });

  it("Hunter's Mark is offered on weapon damage, with its condition", () => {
    const log = logFor("beren");
    add(log, "spell:hunters-mark");
    expect(bow(log).damage.bonus.suggestions).toContainEqual(
      expect.objectContaining({ label: "Hunter's Mark", effect: "+1d6", reason: "only against the marked target" }),
    );
  });
});

describe("conditions (2014)", () => {
  it("Poisoned: disadvantage on attacks and checks, passive Perception -5", () => {
    const log = logFor("beren");
    add(log, "condition:poisoned");
    const s = sheetOf(log);
    expect(bow(log).attack.disadvantage).toEqual(["Poisoned"]);
    expect(s.skills.stealth.disadvantage).toEqual(["Poisoned"]);
    expect(s.saves.dex.disadvantage).toEqual([]);
    expect(s.passives.perception.total).toBe(12);
  });

  it("adding the same condition twice is noted, not duplicated", () => {
    const log = logFor("beren");
    add(log, "condition:poisoned");
    expect(add(log, "condition:poisoned")).toEqual(["Already poisoned."]);
    expect(log.character.effects).toHaveLength(1);
  });

  it("Grappled: speed 0, shown as its own line", () => {
    const log = logFor("beren");
    add(log, "condition:grappled");
    const s = sheetOf(log);
    expect(s.speed.total).toBe(0);
    expect(s.speed.parts.at(-1)).toEqual({ label: "Grappled (0)", value: -30 });
  });

  it("Paralyzed: Strength and Dexterity saves fail automatically, and it includes Incapacitated", () => {
    const log = logFor("beren");
    add(log, "condition:paralyzed");
    const s = sheetOf(log);
    expect(s.saves.dex.autoFail).toEqual(["Paralyzed"]);
    expect(s.saves.wis.autoFail).toBeUndefined();
    expect(s.effects[0]!.reminders).toContain("You can't take actions or reactions.");
  });

  it("Hold Person brings Paralyzed with it", () => {
    const log = logFor("elissaios");
    add(log, "spell:hold-person");
    expect(sheetOf(log).saves.str.autoFail).toEqual(["Paralyzed (Hold Person)"]);
  });

  it("Unconscious includes Prone: disadvantage on attacks", () => {
    const log = logFor("beren");
    add(log, "condition:unconscious");
    expect(bow(log).attack.disadvantage).toEqual(["Prone (Unconscious)"]);
  });

  it("Invisible and Poisoned together cancel to a normal roll", () => {
    const log = logFor("beren");
    add(log, "condition:invisible");
    add(log, "condition:poisoned");
    expect(composeD20(bow(log).attack).d20Mode).toBe("normal");
  });

  it("Petrified: resistance to every damage type", () => {
    const log = logFor("beren");
    add(log, "condition:petrified");
    expect(sheetOf(log).defenses.resist).toHaveLength(13);
    expect(log.record("damage", { amount: 10, damageType: "fire" })).toEqual(["Resistant to fire: 10 halved to 5."]);
  });
});

describe("exhaustion", () => {
  it("levels stack and each adds its rule to the ones before", () => {
    const log = logFor("agaklis");
    add(log, "condition:exhaustion");
    let s = sheetOf(log);
    expect(s.skills.athletics.disadvantage).toEqual(["Exhaustion 1"]);
    expect(s.speed.total).toBe(40);

    expect(add(log, "condition:exhaustion")).toEqual(["Exhaustion is now level 2."]);
    s = sheetOf(log);
    expect(s.speed.total).toBe(20);
    expect(log.character.effects).toHaveLength(1);

    add(log, "condition:exhaustion", { level: 2 });
    s = sheetOf(log);
    expect(s.saves.con.disadvantage).toEqual(["Exhaustion 4"]);
    expect(s.hpMax.total).toBe(47);
    expect(log.character.hp.current).toBe(47);
  });

  it("a level can be lowered directly", () => {
    const log = logFor("agaklis");
    add(log, "condition:exhaustion", { level: 3 });
    log.record("updateEffect", { instanceId: log.character.effects[0]!.id, level: 1 });
    expect(sheetOf(log).speed.total).toBe(40);
  });
});

describe("durations", () => {
  it("End of turn counts rounds down and ends effects at 0", () => {
    const log = logFor("beren");
    add(log, "spell:bless");
    add(log, "condition:prone");
    for (let i = 0; i < 9; i++) log.record("endTurn", {});
    expect(log.character.effects.find((e) => e.effect === "spell:bless")!.rounds).toBe(1);
    expect(log.record("endTurn", {})).toEqual(["Ended: Bless."]);
    expect(log.character.effects.map((e) => e.effect)).toEqual(["condition:prone"]);
  });

  it("a custom duration overrides the default", () => {
    const log = logFor("beren");
    add(log, "spell:bless", { rounds: 3 });
    expect(log.character.effects[0]!.rounds).toBe(3);
  });
});

describe("custom effects", () => {
  it("a DM ruling of +2 to attacks applies like any other effect", () => {
    const log = logFor("beren");
    add(log, "custom", { custom: { name: "High ground", modifiers: [{ selector: "roll.attack.*", op: "add", value: 2 }] }, rounds: 2 });
    expect(bow(log).attack.total).toBe(9);
    expect(bow(log).attack.parts.at(-1)).toEqual({ label: "High ground", value: 2 });
  });
});
