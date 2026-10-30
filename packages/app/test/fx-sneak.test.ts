import { describe, expect, it } from "vitest";
import { rollFx } from "../src/fx/triggers.js";
import { sneakTier, specOf } from "../src/fx/FxLayer.js";
import type { RollRecord } from "../src/rolls.js";

const dmg = (total: number): RollRecord => ({ id: "r", at: 0, title: "Rapier damage", kind: "damage", total, crit: false, fumble: false, physical: false, lines: [{ source: "Weapon", detail: "5", total: 5 }, { source: "Sneak Attack", detail: "3+3", total: total - 5 }] });

describe("Sneak Attack by the hit's damage", () => {
  it("seven tiers at 10, 20, 30, 50, 80, 100", () => {
    expect([1, 10, 11, 20, 21, 30, 31, 50, 51, 80, 81, 100, 101, 250].map(sneakTier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
  });
  it("each tier bigger than the last: small ones at the roll, the rest across the screen, shaking from 31", () => {
    const specs = [8, 15, 25, 40, 66, 90, 123].map((n) => specOf(rollFx(dmg(n))[0]!));
    expect(specs.map((s) => s.at)).toEqual(["result", "result", "edge", "edge", "edge", "edge", "edge"]);
    expect(specs.map((s) => s.look)).toEqual(["fx-sneak", "fx-sneak fx-sneak-2", "fx-sa fx-sa-3", "fx-sa fx-sa-4", "fx-sa fx-sa-5", "fx-sa fx-sa-6", "fx-sa fx-sa-7"]);
    expect(specs[6]!.label).toBe("Sneak Attack · 123");
    const ms = specs.map((s) => s.ms);
    expect([...ms].sort((a, b) => a - b)).toEqual(ms);
    expect(specs.slice(0, 3).every((s) => !s.shake)).toBe(true);
    expect(specs.slice(3).map((s) => s.shake)).toEqual([200, 320, 480, 700]);
  });
});
