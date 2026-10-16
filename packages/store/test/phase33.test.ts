import { describe, expect, it } from "vitest";
import { derive, evalExpr, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_820_000_000_000;
const sorcerer = (level: number, subclass: string, choices: Record<string, Record<string, string[]>> = {}) => {
  const c = newCharacter({ id: "s", name: "S", race: "race:human", class: "class:sorcerer", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 17 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, subclass };
  Object.assign(c.choices, choices);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const points = (l: CharacterLog) => derive(l.character, reg).resources.find((r) => r.id === "sorcery-points")!;
const hound = (l: CharacterLog) => derive(l.character, reg).companions.find((x) => x.id === "hound-of-ill-omen")!;

describe("Hound of Ill Omen", () => {
  it("isn't out until summoned; the bonus action spends 3 points once and brings it with temp HP of half your sorcerer level", () => {
    const l = sorcerer(7, "subclass:shadow-magic");
    expect(hound(l)).toMatchObject({ summonedBy: { action: "hound-of-ill-omen", out: false } });
    expect(hound(l).form).toBeUndefined();
    l.record("useAction", { action: "hound-of-ill-omen" });
    expect(points(l)).toMatchObject({ max: 7, used: 3 });
    const h = hound(l);
    expect(h.summonedBy?.out).toBe(true);
    // The dire wolf's own 37 HP, plus 3 temporary (7 ÷ 2, rounded down).
    expect(h.form).toMatchObject({ name: "Hound of Ill Omen", type: "monstrosity", hp: { current: 37, temp: 3 } });
    expect(h.form!.hpMax.total).toBe(37);
    expect(h.form!.attacks[0]).toMatchObject({ name: "Bite", attack: { total: 5 }, damage: { dice: "2d6", bonus: { total: 3 } } });
    expect(l.character.effects.filter((e) => e.companion === "hound-of-ill-omen")).toHaveLength(1);
  });

  it("summoned again: a fresh hound and one timer, not two", () => {
    const l = sorcerer(7, "subclass:shadow-magic");
    l.record("useAction", { action: "hound-of-ill-omen" });
    l.record("damage", { amount: 10, companion: "hound-of-ill-omen" });
    expect(hound(l).form!.hp).toEqual({ current: 30, temp: 0 });
    l.record("useAction", { action: "hound-of-ill-omen" });
    expect(hound(l).form!.hp).toEqual({ current: 37, temp: 3 });
    expect(l.character.effects.filter((e) => e.companion === "hound-of-ill-omen")).toHaveLength(1);
    expect(points(l).used).toBe(6);
  });

  it("goes when its 5 minutes are up, when it drops to 0, or when you end it", () => {
    const a = sorcerer(7, "subclass:shadow-magic");
    a.record("useAction", { action: "hound-of-ill-omen" });
    a.record("passTime", { minutes: 4 });
    expect(hound(a).summonedBy?.out).toBe(true);
    a.record("passTime", { minutes: 1 });
    expect(hound(a).summonedBy?.out).toBe(false);
    expect(hound(a).form).toBeUndefined();

    const b = sorcerer(7, "subclass:shadow-magic");
    b.record("useAction", { action: "hound-of-ill-omen" });
    const notes = b.record("damage", { amount: 40, companion: "hound-of-ill-omen" });
    expect(notes.join(" ")).toMatch(/drops to 0/);
    expect(hound(b).summonedBy?.out).toBe(false);
    expect(b.character.effects.some((e) => e.companion)).toBe(false);

    const c = sorcerer(7, "subclass:shadow-magic");
    c.record("useAction", { action: "hound-of-ill-omen" });
    const timer = c.character.effects.find((e) => e.companion === "hound-of-ill-omen")!;
    c.record("removeEffect", { instanceId: timer.id });
    expect(hound(c).summonedBy?.out).toBe(false);
  });

  it("half a level, rounded down, as an expression", () => {
    const ctx = { pb: 3, level: 7, mods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, classLevels: { "class:sorcerer": 7 } };
    expect(evalExpr("classLevel.class:sorcerer/2", ctx as never)).toEqual([{ kind: "flat", value: 3, label: "Class level ÷ 2, rounded down" }]);
  });
});

describe("Sorcery Point costs (audited)", () => {
  it("Eyes of the Dark: Darkness for 2 sorcery points instead of a slot", () => {
    const l = sorcerer(3, "subclass:shadow-magic");
    const dark = derive(l.character, reg).spells.find((s) => s.id === "spell:darkness")!;
    expect(dark.cast.points).toMatchObject({ resource: "sorcery-points", amount: 2, remaining: 3 });
    const slots = { ...l.character.slotsUsed };
    l.record("castSpell", { spell: "spell:darkness", list: "sorcerer", level: 2, using: "points" });
    expect(points(l).used).toBe(2);
    expect(l.character.slotsUsed).toEqual(slots);
  });

  it("Elemental Affinity: 1 point for an hour's resistance to your dragon ancestor's type", () => {
    const l = sorcerer(6, "subclass:draconic", { "feature:dragon-ancestor": { option: ["feature:dragon-ancestor-red---fire-damage"] } });
    expect(derive(l.character, reg).defenses.resist).not.toContain("fire");
    l.record("useAction", { action: "elemental-affinity-resistance" });
    expect(points(l).used).toBe(1);
    expect(derive(l.character, reg).defenses.resist).toContain("fire");
    l.record("passTime", { minutes: 60 });
    expect(derive(l.character, reg).defenses.resist).not.toContain("fire");
  });
});
