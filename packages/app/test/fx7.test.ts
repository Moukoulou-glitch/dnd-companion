import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../../store/src/log.js";
import { HybridClock } from "../../store/src/clock.js";
import { ongoingFx, opFx, rollFx } from "../src/fx/triggers.js";
import { phaseLook } from "../src/fx/spells.js";
import { specOf } from "../src/fx/FxLayer.js";
import type { RollRecord } from "../src/rolls.js";

const reg = tableRegistry();
let t = 1_800_000_000_000;
const druid = (level: number) => {
  const c = newCharacter({ id: "d", name: "D", race: "race:human", class: "class:druid", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level };
  return c;
};
const school = (id: string) => reg.find(id, "spell")?.school;
const dmg = (r: Partial<RollRecord>): RollRecord => ({ id: "r", at: 0, title: "", kind: "damage", total: 0, crit: false, fumble: false, physical: false, lines: [], ...r });

describe("Plant Growth, Wall of Thorns, Shocking Grasp have looks of their own", () => {
  it("Plant Growth in a moment: plants burst up and spread from the ground", () => {
    const c = druid(5);
    expect(opFx("castSpell", { spell: "spell:plant-growth", list: "druid", level: 3, using: "slot", castingTime: "1 action" }, c, c, school)).toEqual([{ kind: "spell", spell: "spell:plant-growth", phase: "cast" }]);
    expect(specOf({ kind: "spell", spell: "spell:plant-growth", phase: "cast" })).toMatchObject({ at: "ground", look: expect.stringContaining("sfx-overgrowth") });
  });

  it("Plant Growth over 8 hours: nothing when it's started, the slow look when it's done", () => {
    const l = new CharacterLog(druid(5), reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("learnSpell", { spell: "spell:plant-growth", list: "druid" });
    const cast = { spell: "spell:plant-growth", list: "druid", level: 3, using: "slot" as const, selfEffect: false, castingTime: "8 hours" };
    let before = l.character;
    l.record("startTimed", { name: "Plant Growth", minutes: 480, cast });
    expect(opFx("startTimed", { name: "Plant Growth", minutes: 480, cast }, before, l.character, school)).toEqual([]);
    before = l.character;
    l.record("finishTimed", {});
    expect(opFx("finishTimed", {}, before, l.character, school)).toEqual([{ kind: "spell", spell: "spell:plant-growth", phase: "cast", mode: "8 hours" }]);
    expect(specOf({ kind: "spell", spell: "spell:plant-growth", phase: "cast", mode: "8 hours" })).toMatchObject({ at: "ground", look: expect.stringContaining("sfx-enrich") });
  });

  it("a ritual's cast look plays when it's finished (the arcane circle of its school)", () => {
    const c: Character = { ...druid(5), timed: { name: "Detect Magic (ritual)", minutes: 10, cast: { spell: "spell:detect-magic", list: "druid", level: 1, using: "ritual", selfEffect: true } } };
    expect(opFx("finishTimed", {}, c, { ...c, timed: undefined }, school)).toEqual([{ kind: "cast", school: "divination" }]);
    // Broken off: no cast look.
    expect(opFx("cancelTimed", {}, c, { ...c, timed: undefined }, school)).toEqual([]);
  });

  it("Wall of Thorns: brambles across the ground, a thorny band while you concentrate, a sting when it hurts something", () => {
    const l = new CharacterLog(druid(11), reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("learnSpell", { spell: "spell:wall-of-thorns", list: "druid" });
    const before = l.character;
    const p = { spell: "spell:wall-of-thorns", list: "druid", level: 6, using: "slot" };
    l.record("castSpell", p as never);
    expect(opFx("castSpell", p, before, l.character, school)).toEqual([{ kind: "spell", spell: "spell:wall-of-thorns", phase: "cast" }]);
    expect(phaseLook("spell:wall-of-thorns", "cast")).toMatchObject({ at: "ground", look: expect.stringContaining("sfx-thorn-wall") });
    expect(ongoingFx(l.character)).toEqual({ spell: "spell:wall-of-thorns", look: "sfx-ongoing-thorns" });
    expect(rollFx(dmg({ spell: "spell:wall-of-thorns", again: true, byType: { piercing: 20 } }))).toEqual([{ kind: "spell", spell: "spell:wall-of-thorns", phase: "again" }]);
    l.record("endConcentration", {});
    expect(ongoingFx(l.character)).toBeUndefined();
  });

  it("Shocking Grasp: crackling arcs where you touch; its damage still plays the lightning look", () => {
    const c = druid(5);
    expect(opFx("castSpell", { spell: "spell:shocking-grasp", list: "wizard", level: 0, using: "none" }, c, c, school)).toEqual([{ kind: "spell", spell: "spell:shocking-grasp", phase: "cast" }]);
    expect(specOf({ kind: "spell", spell: "spell:shocking-grasp", phase: "cast" })).toMatchObject({ at: "tap", look: expect.stringContaining("sfx-shock") });
    expect(phaseLook("spell:shocking-grasp", "resolve")).toBeUndefined();
    expect(rollFx(dmg({ spell: "spell:shocking-grasp", byType: { lightning: 6 } }))).toEqual([expect.objectContaining({ type: "lightning" })]);
  });
});
