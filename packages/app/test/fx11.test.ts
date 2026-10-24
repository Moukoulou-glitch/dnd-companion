import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { FEAT_MS, featureFor, featureLook, featureTier, originOf } from "../src/fx/features.js";
import { Signature } from "../src/fx/Signature.js";
import { opFx } from "../src/fx/triggers.js";

const reg = tableRegistry();
const sheetOf = (cls: string, level: number) => {
  const c = newCharacter({ id: "x", name: "X", race: "race:human", class: cls, abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 14 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level };
  return { c, sheet: derive(c, reg) };
};

describe("feature animations (12c)", () => {
  it("the class and level from where the feature comes from", () => {
    expect(originOf("Fighter 2")).toEqual({ cls: "fighter", level: 2 });
    expect(originOf("Battle Master (Fighter 15)")).toEqual({ cls: "fighter", level: 15 });
    expect(originOf("Fighter 3 · Fighting Style")).toEqual({ cls: "fighter", level: 3 });
    expect(originOf("Race (Elf)")).toEqual({ cls: "race", level: 1 });
    expect(originOf("Feat (Lucky)")).toEqual({ cls: "feat", level: 1 });
    expect(originOf(undefined)).toEqual({ cls: "other", level: 1 });
  });
  it("bigger the later it comes: 1st–2nd, 3rd–5th, 6th–10th, 11th–16th, 17th–20th; never a shake; a tap skips the longest", () => {
    expect([1, 2, 3, 5, 6, 10, 11, 16, 17, 20].map(featureTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    const ms = [0, 1, 2, 3, 4].map((t) => FEAT_MS[t as 0]);
    expect([...ms].sort((a, b) => a - b)).toEqual(ms);
    expect(Math.max(...ms)).toBeLessThanOrEqual(3000);
    const cap = featureLook({ id: "feature:x", name: "Capstone", cls: "monk", level: 20 });
    expect([cap.tier, cap.shake, cap.skippable, cap.at, cap.sig, cap.label]).toEqual([4, 0, true, "center", "cls-monk", "Capstone"]);
    expect(featureLook({ id: "feature:y", name: "Y", cls: "rogue", level: 1 }).skippable).toBe(false);
    for (const cls of ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard", "race", "feat"] as const) {
      const g = featureLook({ id: "f", name: "F", cls, level: 3 });
      expect(Signature({ g, x: 100, y: 100 }).at, cls).toBeTruthy();
    }
  });
  it("Action Surge (fighter 2) from its action, its resource or nothing for a passive or common action", () => {
    const { sheet } = sheetOf("class:fighter", 2);
    const f = featureFor(sheet, "useAction", { action: "action-surge" });
    expect(f).toMatchObject({ cls: "fighter", level: 2, name: "Action Surge" });
    expect(featureFor(sheet, "spendResource", { resource: "action-surge", amount: 1 })).toMatchObject({ cls: "fighter", level: 2 });
    // "Just activate", Dash, an unknown action: nothing.
    expect(featureFor(sheet, "useAction", { action: "action-surge", free: true })).toBeUndefined();
    const common = sheet.actions.find((a) => a.common);
    if (common) expect(featureFor(sheet, "useAction", { action: common.id })).toBeUndefined();
    expect(featureFor(sheet, "useAction", { action: "nope" })).toBeUndefined();
    expect(featureFor(undefined, "useAction", { action: "action-surge" })).toBeUndefined();
  });
  it("uses with their own look keep it: Rage, Flurry of Blows", () => {
    const { sheet } = sheetOf("class:barbarian", 1);
    const rage = sheet.actions.find((a) => a.toggles.includes("raging"));
    expect(rage).toBeDefined();
    expect(featureFor(sheet, "useAction", { action: rage!.id })).toBeUndefined();
    expect(featureFor(sheet, "toggle", { name: "raging", on: true })).toBeUndefined();
    const monk = sheetOf("class:monk", 2).sheet;
    expect(featureFor(monk, "useAction", { action: "flurry-of-blows" })).toBeUndefined();
  });
  it("opFx plays it when a lookup is given; without one, nothing new", () => {
    const { c, sheet } = sheetOf("class:fighter", 17);
    const look = (t: string, p: unknown) => featureFor(sheet, t, p);
    const ev = opFx("useAction", { action: "action-surge" }, c, c, undefined, undefined, look);
    expect(ev).toHaveLength(1);
    expect((ev[0] as { g: { sig: string; tier: number } }).g).toMatchObject({ sig: "cls-fighter", tier: 0 });
    expect(opFx("useAction", { action: "action-surge" }, c, c)).toEqual([]);
  });
});
