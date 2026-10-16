import { describe, expect, it } from "vitest";
import { castingMinutes, derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_850_000_000_000;
const wizard = () => {
  const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 5 };
  c.spells.push({ spell: "spell:detect-magic", list: "wizard", prepared: true } as never, { spell: "spell:mage-armor", list: "wizard", prepared: true } as never, { spell: "spell:find-familiar", list: "wizard", prepared: true } as never);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const cast = (spell: string, using: "ritual" | "slot", level = 1) => ({ spell, list: "wizard", level, using, selfEffect: true });

describe("How long a casting takes", () => {
  it("reads minutes and hours; an action is 0; a ritual adds 10 minutes; the first of two casting times counts unless one is chosen", () => {
    expect(castingMinutes("1 action")).toBe(0);
    expect(castingMinutes("1 action", true)).toBe(10);
    expect(castingMinutes("1 minute", true)).toBe(11);
    expect(castingMinutes("1 hour")).toBe(60);
    expect(castingMinutes("1 hour", true)).toBe(70);
    expect(castingMinutes("8 hours")).toBe(480);
    expect(castingMinutes("1 action or 8 hours")).toBe(0);
    expect(castingMinutes("8 hours")).toBe(480);
    expect(castingMinutes("1 reaction, which you take when…")).toBe(0);
  });
});

describe("A ritual or a long casting takes its time", () => {
  it("a ritual: started, nothing spent; done, its 10 minutes pass and then it's cast (no slot)", () => {
    const l = wizard();
    l.record("addEffect", { instanceId: "ma", effect: "effect:mage-armor" }); // 8 hours, to watch time pass
    const before = l.character.effects.find((e) => e.id === "ma")!.minutes!;
    l.record("startTimed", { name: "Detect Magic (ritual)", minutes: 10, cast: cast("spell:detect-magic", "ritual") });
    expect(l.character.timed).toMatchObject({ name: "Detect Magic (ritual)", minutes: 10 });
    expect(l.character.concentration).toBeUndefined();
    expect(l.character.effects.find((e) => e.id === "ma")!.minutes).toBe(before);
    l.record("finishTimed", {});
    expect(l.character.timed).toBeUndefined();
    expect(l.character.effects.find((e) => e.id === "ma")!.minutes).toBe(before - 10);
    // Cast now: it starts at the end of the casting time (its concentration is full).
    expect(l.character.concentration?.spell).toBe("spell:detect-magic");
    expect(l.character.concentration?.minutes).toBe(10);
    expect(l.character.slotsUsed["1"] ?? 0).toBe(0);
  });

  it("a long casting with a slot: the slot is spent when it's done, not when it starts", () => {
    const l = wizard();
    l.record("startTimed", { name: "Find Familiar", minutes: 60, cast: cast("spell:find-familiar", "slot") });
    expect(l.character.slotsUsed["1"] ?? 0).toBe(0);
    l.record("finishTimed", {});
    expect(l.character.slotsUsed["1"]).toBe(1);
  });

  it("interrupted: nothing cast or spent; the minutes that did pass are counted once", () => {
    const l = wizard();
    l.record("addEffect", { instanceId: "ma", effect: "effect:mage-armor" });
    const before = l.character.effects.find((e) => e.id === "ma")!.minutes!;
    l.record("startTimed", { name: "Find Familiar", minutes: 60, cast: cast("spell:find-familiar", "slot") });
    const notes = l.record("cancelTimed", { minutes: 25 });
    expect(notes.join(" ")).toMatch(/interrupted.*no slot is spent.*25 minutes passed/);
    expect(l.character.timed).toBeUndefined();
    expect(l.character.slotsUsed["1"] ?? 0).toBe(0);
    expect(l.character.effects.find((e) => e.id === "ma")!.minutes).toBe(before - 25);
    // Finishing after that does nothing (and passes no time twice).
    expect(l.record("finishTimed", {}).join(" ")).toMatch(/Nothing is under way/);
    expect(l.character.effects.find((e) => e.id === "ma")!.minutes).toBe(before - 25);
  });

  it("it stays under way through a reload (it's in the saved character and its log)", () => {
    const l = wizard();
    l.record("startTimed", { name: "Detect Magic (ritual)", minutes: 10, cast: cast("spell:detect-magic", "ritual") });
    const again = new CharacterLog(l.base, reg, new HybridClock("u", () => (t += 1000)), "player", [...l.operations]);
    expect(again.character.timed?.name).toBe("Detect Magic (ritual)");
    expect(derive(again.character, reg).spells.length).toBeGreaterThan(0);
  });

  it("in combat it says how many rounds that is, and finishing moves round timers on by that much", () => {
    const l = wizard();
    l.record("startCombat", {});
    l.record("addEffect", { instanceId: "b", effect: "effect:bless", rounds: 10 } as never);
    const notes = l.record("startTimed", { name: "Detect Magic (ritual)", minutes: 10, cast: cast("spell:detect-magic", "ritual") });
    expect(notes.join(" ")).toMatch(/in combat: that's 100 rounds/);
    l.record("finishTimed", {});
    expect(l.character.effects.some((e) => e.id === "b")).toBe(false);
  });
});
