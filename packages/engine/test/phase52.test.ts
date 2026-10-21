import { describe, expect, it } from "vitest";
import { creatureBlock, multiattackCount, summonOptions } from "../src/shapes.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();

describe("8l: demons, devils and the peryton (stat blocks in our own words)", () => {
  it("new creatures: the barlgura's three attacks and spells, the chasme's necrotic, the peryton", () => {
    const b = reg.find("creature:barlgura", "creature")!;
    expect([b.cr, b.ac, b.hp, multiattackCount(b)]).toEqual([5, 15, 68, 3]);
    const block = creatureBlock(reg, "creature:chasme")!;
    expect(block.attacks[0]!.damage.bonus.dice).toEqual([expect.objectContaining({ dice: "7d6", damageType: "necrotic" })]);
    expect(reg.find("creature:peryton", "creature")!.speed).toEqual({ walk: 20, fly: 60 });
  });
  it("Summon Greater Demon: CR 5 or lower at 4th, 7 at 6th; one demon", () => {
    const o4 = summonOptions(reg, "summon:summon-greater-demon", 4)!;
    expect(o4.maxCr).toBe(5);
    expect(o4.count).toBe(1);
    expect(summonOptions(reg, "summon:summon-greater-demon", 6)!.maxCr).toBe(7);
  });
  it("Summon Lesser Demons: the three choices, doubled at 6th", () => {
    expect(summonOptions(reg, "summon:summon-lesser-demons", 3)!.tiers).toEqual([{ maxCr: 1, count: 2 }, { maxCr: 0.5, count: 4 }, { maxCr: 0.25, count: 8 }]);
    expect(summonOptions(reg, "summon:summon-lesser-demons", 6)!.tiers[0]).toEqual({ maxCr: 1, count: 4 });
  });
  it("Infernal Calling lists devils; Find Greater Steed has the peryton", () => {
    expect(summonOptions(reg, "summon:infernal-calling", 5)!.creatures.map((c) => c.id)).toContain("creature:barbed-devil");
    expect(summonOptions(reg, "summon:find-greater-steed", 4)!.creatures.map((c) => c.id)).toContain("creature:peryton");
  });
});
