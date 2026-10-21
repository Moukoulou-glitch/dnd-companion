import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { buildItems } from "../src/build.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const char = (level: number, choices: Record<string, Record<string, string[]>> = {}) =>
  Character.parse({ id: "w", schemaVersion: 1, ruleset: "5e-2014", name: "W", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 18 }, race: "race:human", classes: [{ class: "class:warlock", level }], choices, hp: { current: 50, temp: 0 } });
const arcana = (level: number) => buildItems(char(level), reg).filter((i) => !i.done && /Arcanum/.test(JSON.stringify(i)));
const warlock = (level: number, choices: Record<string, Record<string, string[]>> = {}) =>
  derive(
    Character.parse({ id: "w", schemaVersion: 1, ruleset: "5e-2014", name: "W", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 18 }, race: "race:human", classes: [{ class: "class:warlock", level }], choices, hp: { current: 50, temp: 0 } }),
    reg,
  );

describe("8m: Mystic Arcanum", () => {
  it("asks for one arcanum spell at 11th, 13th, 15th and 17th level", () => {
    expect(arcana(10)).toHaveLength(0);
    expect(arcana(11)).toHaveLength(1);
    expect(arcana(17)).toHaveLength(4);
  });
  it("the chosen 6th-level spell: cast once per long rest from its own use, shown as a resource", () => {
    const s = warlock(11, { "feature:mystic-arcanum-6th-level": { spell: ["spell:eyebite"] } });
    const sp = s.spells.find((x) => x.id === "spell:eyebite")!;
    expect(sp).toBeDefined();
    expect(sp.list.id).toBe("warlock");
    const r = s.resources.find((x) => x.id === "mystic-arcanum-6")!;
    expect(r).toMatchObject({ max: 1, reset: "long" });
    expect(r.name).toMatch(/Eyebite/);
  });
});
