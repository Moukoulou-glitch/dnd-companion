import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_899_400_000_000;

describe("25c: recording doesn't replay the whole log", () => {
  it("the state after many operations equals a full replay of the same log, and undo still works", () => {
    const c = newCharacter({ id: "pf", name: "Pf", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("startCombat", {});
    for (let i = 0; i < 40; i++) {
      l.record("startTurn", {});
      l.record("damage", { amount: 1 });
      l.record("heal", { amount: 1 });
      l.record("endTurn", {});
    }
    l.record("addEffect", { instanceId: "b", effect: "effect:bless" });
    const fresh = new CharacterLog(c, reg, new HybridClock("u", () => (t += 1000)), "player", [...l.operations]);
    expect(l.character).toEqual(fresh.character);
    expect(l.history.length).toBe(fresh.history.length);
    expect(l.history.map((h) => h.notes)).toEqual(fresh.history.map((h) => h.notes));
    l.undo();
    expect(l.character.effects.some((e) => e.id === "b")).toBe(false);
    l.redo();
    expect(l.character.effects.some((e) => e.id === "b")).toBe(true);
  });

  it("undo and redo through checkpoints give the same state as a full replay", () => {
    const c = newCharacter({ id: "pg", name: "Pg", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("startCombat", {});
    for (let i = 0; i < 30; i++) {
      l.record("damage", { amount: 1 });
      l.record("heal", { amount: 1 });
      l.record("startTurn", {});
    }
    const same = () => {
      const fresh = new CharacterLog(c, reg, new HybridClock("u", () => (t += 1000)), "player", [...l.operations]);
      expect(l.character).toEqual(fresh.character);
      expect(l.history.length).toBe(l.operations.length);
    };
    for (let i = 0; i < 40; i++) l.undo();
    same();
    for (let i = 0; i < 15; i++) l.redo();
    same();
    l.record("damage", { amount: 3 });
    same();
    for (let i = 0; i < 60; i++) l.undo();
    same();
  });
});

