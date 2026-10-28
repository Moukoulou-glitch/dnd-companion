import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_806_000_000_000;
const log = () => new CharacterLog(newCharacter({ id: "p", name: "Test", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } }, reg), reg, new HybridClock("t", () => (t += 1000)), "player");
const wolf = { id: "w1", name: "Grey", kind: "Pet", size: "Medium", type: "beast", ac: 13, hpMax: 11, speed: "40 ft.", abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, traits: [], attacks: [], notes: "" };

describe("13c fixes in play", () => {
  it("critical range by hand: set, explained, back to normal", () => {
    const l = log();
    l.record("setCritAdjust", { at: 18, note: "Homebrew blade" });
    expect(l.character.critAdjust).toEqual({ at: 18, note: "Homebrew blade" });
    l.record("setCritAdjust", { at: 20, note: "" });
    expect(l.character.critAdjust).toBeUndefined();
  });
  it("Aid on a companion: its level can change, and its hit points follow", () => {
    const l = log();
    l.record("setCustomCompanion", { companion: wolf });
    l.record("companionEffect", { companion: "custom-w1", effect: "effect:aid", add: true, slotLevel: 2 });
    const c0 = derive(l.character, reg).companions.find((x) => x.id === "custom-w1")!;
    expect([c0.form?.hpMax.total, c0.effects[0]?.slotLevel, c0.effects[0]?.baseLevel]).toEqual([16, 2, 2]);
    l.record("damage", { amount: 6, companion: "custom-w1" });
    const inst = l.character.companions["custom-w1"]!.effects![0]!.id;
    l.record("companionEffect", { companion: "custom-w1", effect: "effect:aid", add: false, instance: inst, slotLevel: 4 });
    const c1 = derive(l.character, reg).companions.find((x) => x.id === "custom-w1")!;
    expect([c1.form?.hpMax.total, c1.form?.hp.current, c1.effects.length]).toEqual([26, 20, 1]);
  });
});

describe("13d additions in play", () => {
  it("Simulacrum: half the creature's hit points", () => {
    const l = log();
    l.record("summon", { spell: "spell:simulacrum", group: "sim", creatures: [{ creature: "creature:knight", count: 1 }] });
    const m = l.character.summons[0]!;
    expect([m.hp, m.maxHpAdjust?.reduce]).toEqual([26, 26]);
  });
});
