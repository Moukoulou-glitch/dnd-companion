import { describe, expect, it } from "vitest";
import { composeDamage, damageTypesIn, diceToRoll, isMaxed, physicalDamageTotal, type ComposerBase } from "../src/index.js";

const base = (extra: Partial<ComposerBase> = {}): ComposerBase => ({ total: 0, parts: [], dice: [], advantage: [], disadvantage: [], suggestions: [], ...extra });
const wrath = { label: "Destructive Wrath", effect: "max", apply: { flat: 0, dice: [], maximize: true }, forTypes: ["lightning", "thunder"], spends: { resource: "channel-divinity", amount: 1 } };
const on = (...enabled: string[]) => ({ enabled, manual: "none" as const, extra: 0 });

describe("options for some damage types only (Destructive Wrath)", () => {
  it("maxes a thunder spell's dice; does nothing on fire", () => {
    const thunder = composeDamage("3d8", "thunder", base({ suggestions: [wrath] }), on("Destructive Wrath"), "Shatter");
    expect(thunder.terms.filter((t) => t.kind === "dice").every(isMaxed)).toBe(true);
    const fire = composeDamage("8d6", "fire", base({ suggestions: [wrath] }), on("Destructive Wrath"), "Fireball");
    expect(fire.terms.some(isMaxed)).toBe(false);
  });
  it("Fireball made thunder (Transmuted Spell): the type it's rolled with counts", () => {
    const c = composeDamage("8d6", "thunder", base({ suggestions: [wrath] }), on("Destructive Wrath"), "Fireball");
    expect(c.terms.every((t) => t.kind !== "dice" || isMaxed(t))).toBe(true);
  });
  it("on a weapon: only the thunder dice (Divine Strike), not the mace's", () => {
    const strike = { label: "Divine Strike", effect: "+1d8", apply: { flat: 0, dice: ["1d8"], damageType: "thunder" } };
    const c = composeDamage("1d6", "bludgeoning", base({ suggestions: [strike, wrath] }), on("Divine Strike", "Destructive Wrath"));
    const dice = c.terms.filter((t) => t.kind === "dice");
    expect(dice.map((t) => [t.label, isMaxed(t)])).toEqual([["bludgeoning", false], ["thunder", true]]);
    expect(damageTypesIn(c)).toEqual(new Set(["bludgeoning", "thunder"]));
    // Your own dice: the d8 isn't rolled, its 8 is added.
    expect(diceToRoll(c)).toBe("1d6");
    expect(physicalDamageTotal(c, 4)).toBe(12);
    // Without Divine Strike there's no thunder: nothing maxed.
    expect(composeDamage("1d6", "bludgeoning", base({ suggestions: [strike, wrath] }), on("Destructive Wrath")).terms.some(isMaxed)).toBe(false);
  });
  it("a bonus for one type only applies when that's the type rolled (Elemental Affinity on fire)", () => {
    const aff = { label: "Elemental Affinity", effect: "+3 (fire)", apply: { flat: 3, dice: [] }, forTypes: ["fire"], preset: "always" as const };
    const flat = (t: string) => composeDamage("8d6", t, base({ suggestions: [aff] }), on("Elemental Affinity")).terms.filter((x) => x.kind === "flat").reduce((n, x) => n + (x.kind === "flat" ? x.value : 0), 0);
    expect(flat("fire")).toBe(3);
    expect(flat("thunder")).toBe(0);
  });
});
