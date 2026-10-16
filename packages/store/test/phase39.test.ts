import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { zeroHpOptions } from "../src/zeroHp.js";

const reg = tableRegistry();
let t = 1_820_000_000_000;
/** A 1st-level Shadow Magic sorcerer: Constitution 14, so 8 hit points. */
const shadow = (race = "race:human", concentrating = false) => {
  const c = newCharacter({ id: "s", name: "S", race, class: "class:sorcerer", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 16 } }, reg);
  c.classes[0] = { ...c.classes[0]!, subclass: "subclass:shadow-magic" };
  if (concentrating) c.concentration = { spell: "spell:bless", name: "Bless" } as never;
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const hp = (l: CharacterLog) => l.character.hp.current;
const left = (l: CharacterLog) => derive(l.character, reg).resources.find((r) => r.id === "strength-of-the-grave")?.remaining;

describe("Strength of the Grave: a Charisma save when damage would drop you to 0", () => {
  it("is offered with DC 5 + the damage taken, only when it could help", () => {
    const l = shadow();
    const max = derive(l.character, reg).hpMax.total;
    expect(left(l)).toBe(1);
    expect(zeroHpOptions(l.character, { amount: 10 }, reg)).toEqual({ grave: { dc: 15 }, relentless: false });
    // Still standing: nothing to ask. Radiant: never. Killed outright (massive damage): never.
    expect(zeroHpOptions(l.character, { amount: max - 1 }, reg).grave).toBeUndefined();
    expect(zeroHpOptions(l.character, { amount: 10, damageType: "radiant" }, reg).grave).toBeUndefined();
    expect(zeroHpOptions(l.character, { amount: max * 2 }, reg).grave).toBeUndefined();
    // Asking changes nothing.
    expect(hp(l)).toBe(max);
  });

  it("the DC counts the damage after resistance", () => {
    // A tiefling resists fire: 20 fire is 10 taken, so DC 15; 12 cold is all taken, DC 17.
    const l = shadow("race:tiefling");
    expect(derive(l.character, reg).defenses.resist).toContain("fire");
    expect(zeroHpOptions(l.character, { amount: 20, damageType: "fire" }, reg).grave?.dc).toBe(15);
    expect(zeroHpOptions(l.character, { amount: 12, damageType: "cold" }, reg).grave?.dc).toBe(17);
  });

  it("a success: 1 hit point instead, used up until a long rest, concentration still checked", () => {
    const l = shadow("race:human", true);
    const notes = l.record("damage", { amount: 10, grave: { saved: true, total: 17 } });
    expect(hp(l)).toBe(1);
    expect(left(l)).toBe(0);
    expect(notes.join(" ")).toMatch(/save 17 against DC 15 succeeds; you drop to 1/);
    expect(l.character.concentration?.name).toBe("Bless");
    expect(l.lastPrompts.some((p) => p.kind === "concentration")).toBe(true);
    // Used: not offered again before a long rest.
    l.record("heal", { amount: 7 });
    expect(zeroHpOptions(l.character, { amount: 10 }, reg).grave).toBeUndefined();
    l.record("rest", { kind: "long" });
    expect(left(l)).toBe(1);
  });

  it("a failure: you drop to 0 and nothing is spent (it can be tried next time)", () => {
    const l = shadow();
    const notes = l.record("damage", { amount: 10, grave: { saved: false, total: 9 } });
    expect(hp(l)).toBe(0);
    expect(left(l)).toBe(1);
    expect(notes.join(" ")).toMatch(/save 9 against DC 15 fails/);
  });

  it("a critical hit rules it out, even with a good save", () => {
    const l = shadow();
    const notes = l.record("damage", { amount: 10, grave: { saved: false, crit: true } });
    expect(hp(l)).toBe(0);
    expect(left(l)).toBe(1);
    expect(notes.join(" ")).toMatch(/critical hit/);
  });

  it("a Half-Orc Shadow sorcerer: a failed save can be followed by Relentless Endurance", () => {
    const l = shadow("race:half-orc");
    expect(zeroHpOptions(l.character, { amount: 10 }, reg)).toEqual({ grave: { dc: 15 }, relentless: true });
    l.record("damage", { amount: 10, grave: { saved: false, total: 4 }, relentless: true });
    expect(hp(l)).toBe(1);
    expect(left(l)).toBe(1);
    expect(derive(l.character, reg).resources.find((r) => r.id === "relentless-endurance")?.remaining).toBe(0);
  });

  it("replays the same from the log", () => {
    const l = shadow();
    l.record("damage", { amount: 10, grave: { saved: true, total: 20 } });
    const again = new CharacterLog(l.base, reg, new HybridClock("t", () => (t += 1000)), "player", [...l.operations]);
    expect(again.character.hp.current).toBe(1);
  });
});
