import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const cleric = (level: number, subclass: string, extra: Record<string, unknown> = {}) =>
  derive(
    Character.parse({ id: "c", schemaVersion: 1, ruleset: "5e-2014", name: "C", abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 10 }, race: "race:human", classes: [{ class: "class:cleric", level, subclass }], hp: { current: 50, temp: 0 }, ...extra }),
    reg,
  );
const sugg = (s: ReturnType<typeof cleric>, id: string) => s.spells.find((x) => x.id === id)?.damageBonus?.suggestions.map((x) => x.label) ?? [];
const toll = (s: ReturnType<typeof cleric>) => s.spells.find((x) => x.id === "spell:toll-the-dead");
const has = (s: ReturnType<typeof cleric>, name: string) => s.features.some((f) => f.name === name);

describe("9a: Toll the Dead, Blessed Strikes and Divine Strike", () => {
  it("Toll the Dead has its d8s and its d12s, growing with character level", () => {
    const s = cleric(5, "subclass:life", { spells: [{ spell: "spell:toll-the-dead", list: "cleric" }] });
    expect(toll(s)?.damage).toMatchObject({ byLevel: { 0: "2d8" }, label: "Target unhurt", alt: { label: "Target missing hit points", byLevel: { 0: "2d12" } } });
  });
  it("Blessed Strikes (on by default) adds 1d8 radiant to cantrips and stands in for Divine Strike", () => {
    const s = cleric(8, "subclass:life", { spells: [{ spell: "spell:toll-the-dead", list: "cleric" }, { spell: "spell:guiding-bolt", list: "cleric" }] });
    expect(has(s, "Blessed Strikes")).toBe(true);
    expect(has(s, "Divine Strike")).toBe(false);
    expect(sugg(s, "spell:toll-the-dead")).toContain("Blessed Strikes");
    // Not on leveled spells.
    expect(sugg(s, "spell:guiding-bolt")).not.toContain("Blessed Strikes");
    expect(s.optionalFeatures.find((f) => f.name === "Blessed Strikes")).toMatchObject({ on: true, both: false, instead: ["Divine Strike"] });
  });
  it("off: Divine Strike is back; both: kept together, beyond the rules", () => {
    const off = cleric(8, "subclass:life", { optionalOff: ["feature:cleric-blessed-strikes"] });
    expect(has(off, "Divine Strike")).toBe(true);
    expect(has(off, "Blessed Strikes")).toBe(false);
    const both = cleric(8, "subclass:life", { optionalBoth: ["feature:cleric-blessed-strikes"] });
    expect(has(both, "Divine Strike")).toBe(true);
    expect(has(both, "Blessed Strikes")).toBe(true);
    expect(both.optionalFeatures.find((f) => f.name === "Blessed Strikes")?.both).toBe(true);
  });
  it("Potent Spellcasting is for cantrips only", () => {
    const s = cleric(8, "subclass:light-domain", { optionalOff: ["feature:cleric-blessed-strikes"], spells: [{ spell: "spell:toll-the-dead", list: "cleric" }, { spell: "spell:guiding-bolt", list: "cleric" }] });
    expect(sugg(s, "spell:toll-the-dead")).toContain("Potent Spellcasting");
    expect(sugg(s, "spell:guiding-bolt")).not.toContain("Potent Spellcasting");
  });
});
