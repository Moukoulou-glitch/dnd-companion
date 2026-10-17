import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { composeDamage, rollComposed, scriptedRng } from "@dnd/dice";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

/** An invented level 5 fighter with Great Weapon Fighting and a greatsword. */
const reg = tableRegistry();
const fighter = Character.parse({
  id: "gwf",
  schemaVersion: 1,
  ruleset: "5e-2014",
  name: "Test Fighter",
  abilities: { str: 18, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
  race: "race:human",
  classes: [{ class: "class:fighter", level: 5 }],
  choices: { "feature:fighter-fighting-style": { option: ["feature:style-great-weapon-fighting"] } },
  inventory: [{ id: "w1", item: "item:greatsword", equipped: true }],
  hp: { current: 44, temp: 0 },
});

describe("Great Weapon Fighting (7e finding: the reroll was never offered)", () => {
  const sheet = derive(fighter, reg);
  const gs = sheet.attacks.find((a) => a.name === "Greatsword")!;
  const gwf = gs.damage.bonus.suggestions.find((s) => s.label === "Great Weapon Fighting");

  it("is a tick-box on the damage roll, rerolling 1s and 2s", () => {
    expect(gwf).toBeDefined();
    expect(gwf!.apply.rerollAtOrBelow).toBe(2);
    expect(gwf!.reason).toMatch(/two hands/);
  });

  it("ticked: a 1 or 2 is rolled once more and the new roll counts, even another 1 or 2", () => {
    const c = composeDamage(gs.damage.dice, gs.damage.type, gs.damage.bonus, { enabled: ["Great Weapon Fighting"], manual: "none", extra: 0 });
    // 2d6: the first die 1, rolled again: 2 (kept); the second 6.
    const r = rollComposed(c, undefined, scriptedRng([1, 2, 6])).result;
    expect(r.terms[0]!.total).toBe(8);
  });

  it("not ticked: nothing is rerolled", () => {
    const c = composeDamage(gs.damage.dice, gs.damage.type, gs.damage.bonus, { enabled: [], manual: "none", extra: 0 });
    const r = rollComposed(c, undefined, scriptedRng([1, 6])).result;
    expect(r.terms[0]!.total).toBe(7);
  });
});
