import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (str: number, race: string, inventory: unknown[], extra: Record<string, unknown> = {}) =>
  derive(
    Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str, dex: 12, con: 14, int: 10, wis: 10, cha: 10 }, race, classes: [{ class: "class:fighter", level: 1 }], hp: { current: 12, temp: 0 }, inventory, ...extra }),
    reg,
  );
const item = (id: string, item: string, quantity = 1, equipped = false) => ({ id, item, quantity, equipped, attuned: false });

describe("11e-1: armor", () => {
  it("armor that hampers stealth gives disadvantage on Stealth", () => {
    expect(pc(16, "race:human", [item("a", "item:chain-mail", 1, true)]).skills.stealth.disadvantage).toContain("Chain Mail");
    expect(pc(16, "race:human", [item("a", "item:chain-shirt", 1, true)]).skills.stealth.disadvantage).toEqual([]);
  });
  it("heavy armor without its Strength: 10 ft slower, not for dwarves", () => {
    const weak = pc(12, "race:human", [item("a", "item:plate-armor", 1, true)]);
    expect(weak.speed.total).toBe(20);
    expect(weak.speed.parts.some((p) => /needs Strength 15/.test(p.label))).toBe(true);
    expect(pc(15, "race:human", [item("a", "item:plate-armor", 1, true)]).speed.total).toBe(30);
    expect(pc(12, "race:hill-dwarf", [item("a", "item:plate-armor", 1, true)]).speed.total).toBe(25);
  });
});

describe("11e-1: encumbrance", () => {
  const heavy = [item("a", "item:plate-armor", 1), item("b", "item:chain-mail", 1)]; // 65 + 55 = 120 lb.
  it("not tracked unless picked; coins count 50 to the pound", () => {
    const s = pc(10, "race:human", heavy, { currency: { gp: 100 } });
    expect(s.encumbrance).toMatchObject({ rule: "none", carried: 122, capacity: 165, state: "fine" });
    expect(s.speed.total).toBe(30);
  });
  it("variant: −10 ft over 5 × Str, −20 ft and disadvantage over 10 × Str", () => {
    const enc = pc(16, "race:human", heavy, { settings: { physicalDice: true, encumbrance: "variant" } });
    expect(enc.encumbrance.state).toBe("encumbered");
    expect(enc.speed.total).toBe(20);
    const hv = pc(10, "race:human", heavy, { settings: { physicalDice: true, encumbrance: "variant" } });
    expect(hv.encumbrance.state).toBe("heavy");
    expect(hv.speed.total).toBe(10);
    expect(hv.saves.con.disadvantage).toContain("Heavily encumbered");
    expect(hv.skills.athletics.disadvantage).toContain("Heavily encumbered");
    expect(hv.saves.wis.disadvantage).not.toContain("Heavily encumbered");
  });
  it("standard: over Str × 15 is warned", () => {
    const s = pc(6, "race:human", heavy, { settings: { physicalDice: true, encumbrance: "standard" } });
    expect(s.encumbrance.state).toBe("over");
    expect(s.warnings.join(" ")).toMatch(/over your carrying capacity of 105 lb/);
    expect(s.speed.total).toBe(30);
  });
});
