import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/index.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (extra: Record<string, unknown> = {}, level = 9) =>
  derive(
    Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10 }, race: "race:human", classes: [{ class: "class:rogue", level, subclass: "subclass:thief" }], hp: { current: 30, temp: 0 }, ...extra }),
    reg,
  );

describe("25f: Thief and Sharpshooter", () => {
  it("Fast Hands: Use an Object, Sleight of Hand and thieves' tools as bonus actions", () => {
    const a = pc({}, 3).actions.filter((x) => x.id.startsWith("fast-hands-"));
    expect(a.map((x) => [x.id, x.economy])).toEqual([
      ["fast-hands-use-an-object", "bonus"],
      ["fast-hands-sleight-of-hand", "bonus"],
      ["fast-hands-thieves-tools", "bonus"],
    ]);
  });
  it("Supreme Sneak: ticked when you've moved no more than half your speed this turn, a warning past it", () => {
    const sneak = (moved: number) => pc({ combat: { round: 1, myTurn: true, moved } }).skills.stealth.suggestions.find((s) => s.label === "Supreme Sneak")!;
    expect(sneak(15).preset).toBe("always");
    expect(sneak(20).preset).toBeUndefined();
    expect(sneak(20).reason).toMatch(/more than half your speed \(15 ft\)/);
    expect(pc().skills.stealth.suggestions.find((s) => s.label === "Supreme Sneak")!.preset).toBeUndefined();
  });
  it("Sharpshooter: long range is struck out, not an option", () => {
    const bow = (extra: Record<string, unknown>) =>
      pc({ inventory: [{ id: "b", item: "item:shortbow", quantity: 1, equipped: true, attuned: false }], ...extra }).attacks.find((a) => a.name === "Shortbow")!;
    const plain = bow({});
    expect(plain.attack.suggestions.some((s) => s.label === "Long range")).toBe(true);
    const sharp = bow({ feats: [{ feat: "feat:sharpshooter", from: "Level 4 Ability Score Improvement" }] });
    expect(sharp.attack.suggestions.some((s) => s.label === "Long range")).toBe(false);
    expect(sharp.attack.cancelled).toEqual([expect.objectContaining({ label: "Long range", by: "Sharpshooter" })]);
  });
});

describe("25k: Reliable Talent", () => {
  it("on proficient skills and tools a d20 of 9 or lower counts as 10, on its own; not on other checks", () => {
    const s = pc({ background: "background:acolyte" }, 11);
    const prof = Object.values(s.skills).find((x) => x.proficiency > 0)!;
    const not = Object.values(s.skills).find((x) => x.proficiency === 0)!;
    expect(prof.minD20).toBe(10);
    expect(prof.suggestions.some((x) => x.label === "Reliable Talent")).toBe(false);
    expect(not.minD20).toBeUndefined();
    const tool = s.tools.find((t) => /thieves/i.test(t.name))!;
    expect(tool.checks.dex.minD20).toBe(10);
    expect(s.abilityChecks.str.minD20).toBeUndefined();
    expect(pc({ background: "background:acolyte" }, 10).tools.find((t) => /thieves/i.test(t.name))!.checks.dex.minD20).toBeUndefined();
  });
});
