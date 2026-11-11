import { describe, expect, it } from "vitest";
import { derive, newCharacter, raceBonusLines } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_890_000_000_000;
const base = { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 15 } as const;
const tiefling = (raceMoves?: Record<string, string>) =>
  newCharacter({ id: "t", name: "T", race: "race:tiefling", class: "class:warlock", abilities: { ...base }, ...(raceMoves ? { raceMoves: raceMoves as never } : {}) }, reg);
const log = (raceMoves?: Record<string, string>) => new CharacterLog(tiefling(raceMoves), reg, new HybridClock("t", () => (t += 1000)), "player");

describe("22h: the race's increases on other abilities (Customizing Your Origin)", () => {
  it("as the race gives them: +2 Charisma, +1 Intelligence", () => {
    const s = derive(tiefling(), reg);
    expect(s.abilities.cha.score.total).toBe(17);
    expect(s.abilities.int.score.total).toBe(11);
    expect(raceBonusLines(tiefling(), reg)).toEqual([
      { from: "int", to: "int", amount: 1 },
      { from: "cha", to: "cha", amount: 2 },
    ]);
  });
  it("moved in the builder: +2 to Dexterity, +1 to Constitution, with the breakdown saying so", () => {
    const c = tiefling({ cha: "dex", int: "con", wis: "wis" });
    expect(c.raceMoves).toEqual({ cha: "dex", int: "con" });
    const s = derive(c, reg);
    expect(s.abilities.cha.score.total).toBe(15);
    expect(s.abilities.int.score.total).toBe(10);
    expect(s.abilities.dex.score.total).toBe(16);
    expect(s.abilities.con.score.total).toBe(13);
    expect(s.abilities.dex.score.parts.map((p) => p.label)).toContain("Tiefling (its Charisma +2, moved here)");
    expect(s.warnings.join(" ")).not.toMatch(/increases/);
  });
  it("two on one ability: warned, kept", () => {
    const s = derive(tiefling({ int: "cha" }), reg);
    expect(s.abilities.cha.score.total).toBe(18);
    expect(s.warnings.join(" ")).toMatch(/Charisma gets two of them/);
  });
  it("changed on the sheet, back again, and cleared by another race", () => {
    const l = log();
    l.record("setRaceMoves", { moves: { cha: "str" } });
    expect(derive(l.character, reg).abilities.str.score.total).toBe(12);
    l.record("setRaceMoves", { moves: {} });
    expect(l.character.raceMoves).toBeUndefined();
    l.record("setRaceMoves", { moves: { cha: "wis" } });
    l.record("setDetails", { race: "race:tiefling" });
    expect(l.character.raceMoves).toEqual({ cha: "wis" });
    l.record("setDetails", { race: "race:high-elf" });
    expect(l.character.raceMoves).toBeUndefined();
  });
  it("a character saved before this has no moves and the same scores", () => {
    const c = tiefling();
    expect("raceMoves" in c).toBe(false);
    expect(derive(c, reg).abilities.cha.score.parts.find((p) => p.label === "Tiefling")?.value).toBe(2);
  });
});
