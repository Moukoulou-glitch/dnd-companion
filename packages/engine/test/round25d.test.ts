import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "../src/index.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();

describe("25d: Reborn's Deathless Nature", () => {
  const c = newCharacter({ id: "rb", name: "Rb", race: "race:reborn", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
  const s = derive(c, reg);
  it("advantage on death saves, always", () => {
    expect(s.deathSave.advantage).toContain("Deathless Nature");
  });
  it("a Constitution save offers only the disease-or-poison advantage, not the death saves", () => {
    const labels = s.saves.con.suggestions.map((x) => x.label);
    expect(labels).toContain("Deathless Nature");
    expect(labels).toEqual(["Deathless Nature"]);
    expect(s.saves.con.advantage).toEqual([]);
  });
});

describe("25i: the death save as a roll", () => {
  it("a d20 with what applies to all your saves; nothing that's only 'against' something; advantage from Deathless Nature", () => {
    const c = newCharacter({ id: "dz", name: "Dz", race: "race:reborn", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    c.effects.push({ id: "b", effect: "effect:bless" });
    const r = derive(c, reg).deathSaveRoll;
    expect(r.advantage).toContain("Deathless Nature");
    expect(r.dice.map((d) => d.label)).toContain("Bless");
    expect(r.suggestions.some((s) => s.label === "Deathless Nature")).toBe(false);
  });
});
