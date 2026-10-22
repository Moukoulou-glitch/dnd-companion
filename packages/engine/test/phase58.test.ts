import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (effects: unknown[]) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 }, race: "race:human", classes: [{ class: "class:fighter", level: 3 }], hp: { current: 30, temp: 0 }, effects }), reg);

describe("10c: potions' effects", () => {
  it("Giant Strength sets Strength (never lowers it); Resistance gives the type picked", () => {
    const s = pc([{ id: "g", effect: "other:potion-giant-strength", choice: "25", minutes: 60 }]);
    expect(s.abilities.str.score.total).toBe(25);
    expect(s.abilities.str.score.parts.at(-1)?.label).toMatch(/Becomes 25/);
    expect(pc([{ id: "r", effect: "other:potion-resistance", choice: "fire", minutes: 60 }]).defenses.resist).toContain("fire");
  });
  it("Flying and Climbing speeds, Speed's haste without lethargy, Invisibility ends on attack", () => {
    const s = pc([
      { id: "f", effect: "other:potion-flying", minutes: 60 },
      { id: "c", effect: "other:potion-climbing", minutes: 60 },
      { id: "s", effect: "other:potion-speed", rounds: 10 },
      { id: "i", effect: "other:potion-invisibility", minutes: 60 },
    ]);
    expect(s.speeds.map((x) => x.mode).sort()).toEqual(["climb", "fly"]);
    expect(s.speeds.find((x) => x.mode === "fly")?.hover).toBe(true);
    expect(s.speed.total).toBe(60);
    expect(reg.find("other:potion-speed", "effect")?.afterEffect).toBeUndefined();
    expect(s.effects.find((e) => e.id === "other:potion-invisibility")?.endsOn).toEqual(["attack", "cast"]);
  });
  it("the potions are items that say what they do", () => {
    expect(reg.find("item:potion-of-storm-giant-strength", "item")?.use).toMatchObject({ effect: "other:potion-giant-strength", choice: "29" });
    expect(reg.find("item:potion-of-growth", "item")?.use?.hours).toBe("1d4");
    expect(reg.find("item:potion-of-poison", "item")?.use?.damage).toEqual({ dice: "3d6", type: "poison" });
    expect(reg.find("item:potion-of-dragons-majesty", "item")?.use?.transform?.match).toBe("^Adult .* Dragon$");
    expect(reg.find("item:potion-of-vitality", "item")?.use?.removes).toContain("condition:exhaustion");
  });
});

describe("10c fix: Diminution on weapon damage", () => {
  it("weapons deal 1d4 less while it lasts", () => {
    const s = derive(
      Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 }, race: "race:human", classes: [{ class: "class:fighter", level: 3 }], hp: { current: 30, temp: 0 },
        effects: [{ id: "d", effect: "other:potion-diminution", minutes: 120 }], inventory: [{ id: "ls", item: "item:longsword", quantity: 1, equipped: true, attuned: false }] }),
      reg,
    );
    const ls = s.attacks.find((a) => a.name === "Longsword")!;
    expect(ls.damage.bonus.dice).toContainEqual(expect.objectContaining({ dice: "-1d4", label: "Potion of Diminution" }));
    expect(s.saves.str.disadvantage).toContain("Potion of Diminution");
  });
});
