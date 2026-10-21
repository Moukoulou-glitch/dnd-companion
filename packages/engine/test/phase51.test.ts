import { describe, expect, it } from "vitest";
import { creatureBlock, multiattackCount, summonOptions } from "../src/shapes.js";
import { spiritId } from "../src/spirits.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const spirit = (summon: string, variant: string, level: number) => reg.find(spiritId(summon, variant, level, 7, 15), "creature")!;

describe("8l: summoned spirits that grow with the spell's level", () => {
  it("Aberrant Spirit (slaad) at 4th and 6th: AC, hit points, attacks, your attack and DC", () => {
    const a4 = spirit("summon:summon-aberration", "slaad", 4);
    expect([a4.name, a4.ac, a4.hp]).toEqual(["Aberrant Spirit (Slaad)", 15, 40]);
    expect(multiattackCount(a4)).toBe(2);
    const claws = a4.actions.find((x) => x.name === "Claws")!;
    expect(claws.attack).toMatchObject({ toHit: 7, damage: "1d10", damageBonus: 7, damageType: "slashing" });
    expect(a4.traits.map((t) => t.name)).toEqual(["Regeneration"]);
    const a6 = spirit("summon:summon-aberration", "slaad", 6);
    expect([a6.ac, a6.hp, multiattackCount(a6)]).toEqual([17, 60, 3]);
    expect(a6.immune).toEqual(["psychic"]);
  });
  it("variants: their own hit points, speeds, traits and attacks", () => {
    const air = spirit("summon:summon-beast", "air", 2);
    const land = spirit("summon:summon-beast", "land", 3);
    expect([air.hp, air.speed.fly, air.speed.climb]).toEqual([20, 60, undefined]);
    expect([land.hp, land.speed.climb]).toEqual([35, 30]);
    // Below 4th: one attack, no Multiattack.
    expect(multiattackCount(land)).toBe(1);
    const fire = spirit("summon:summon-elemental", "fire", 4);
    expect(fire.actions.find((x) => x.name === "Slam")!.attack!.damageType).toBe("fire");
    expect(fire.immune).toEqual(["poison", "fire"]);
    expect(spirit("summon:summon-celestial", "defender", 5).ac).toBe(18);
    expect(spirit("summon:summon-fiend", "yugoloth", 7).hp).toBe(75);
  });
  it("the Fey Spirit's shortsword adds 1d6 force; your DC is in its Fey Step", () => {
    const fey = creatureBlock(reg, spiritId("summon:summon-fey", "mirthful", 3, 7, 15))!;
    const sword = fey.attacks.find((a) => a.name === "Shortsword")!;
    expect(sword.damage.bonus.dice).toEqual([expect.objectContaining({ dice: "1d6", damageType: "force" })]);
    expect(spirit("summon:summon-fey", "mirthful", 3).bonusActions![0]!.text).toMatch(/DC 15 Wisdom/);
  });
  it("the summon picker offers one of each variant at the slot's level", () => {
    const o = summonOptions(reg, "summon:summon-undead", 5, { attack: 6, dc: 14 })!;
    expect(o.count).toBe(1);
    expect(o.creatures.map((c) => [c.name, c.hp])).toEqual([
      ["Undead Spirit (Ghostly)", 50],
      ["Undead Spirit (Putrid)", 50],
      ["Undead Spirit (Skeletal)", 40],
    ]);
  });
});
