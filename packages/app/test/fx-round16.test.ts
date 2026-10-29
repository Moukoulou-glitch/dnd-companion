import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { opFx } from "../src/fx/triggers.js";
import { specOf, TRUTH_LINES } from "../src/fx/FxLayer.js";

const pc = (race: string, choices: Record<string, Record<string, string[]>> = {}) =>
  Character.parse({ id: "x", schemaVersion: 1, ruleset: "5e-2014", name: "X", abilities: { str: 10, dex: 14, con: 12, int: 10, wis: 14, cha: 16 }, race, classes: [{ class: "class:cleric", level: 5 }], choices, hp: { current: 30, temp: 0 } });

describe("round 16 on screen", () => {
  it("Zone of Truth: the celestial words, cast by you or put on you; no ordinary cast look on top", () => {
    const c = pc("race:human");
    expect(opFx("castSpell", { spell: "spell:zone-of-truth", list: "cleric", level: 2 }, c, c, () => "enchantment")).toEqual([{ kind: "truth" }]);
    expect(opFx("addEffect", { effect: "other:zone-of-truth" }, c, c)).toEqual([{ kind: "truth" }]);
    const spec = specOf({ kind: "truth" });
    expect(spec).toMatchObject({ at: "edge", look: "fx-truth", skippable: true, words: TRUTH_LINES });
    expect(TRUTH_LINES.at(-1)).toBe("Οὐδεὶς δὲν ψεύδεται");
  });
  it("Preserve Life: the rising waterfall", () => {
    const c = pc("race:human");
    expect(opFx("useAction", { action: "preserve-life" }, c, c)).toContainEqual({ kind: "preserve-life" });
    expect(specOf({ kind: "preserve-life" })).toMatchObject({ look: "fx-preserve", label: "Preserve Life" });
  });
  it("Fey Step: the eladrin's season decides the look", () => {
    const c = pc("race:eladrin", { "race:eladrin": { season: ["Nocter"] } });
    const [e] = opFx("useAction", { action: "fey-step" }, c, c);
    expect(e).toEqual({ kind: "fey-step", season: "Nocter" });
    expect(specOf(e!)).toMatchObject({ look: "fx-fey fx-fey-winter", label: "Fey Step · Nocter" });
    expect(opFx("useAction", { action: "fey-step-reaction" }, c, c)[0]).toEqual({ kind: "fey-step", season: "Nocter" });
    expect(specOf({ kind: "fey-step" })).toMatchObject({ look: "fx-fey", label: "Fey Step" });
  });
});
