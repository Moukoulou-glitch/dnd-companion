import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { opFx } from "../src/fx/triggers.js";
import { specOf } from "../src/fx/FxLayer.js";

const druid = (level: number) =>
  Character.parse({ id: "h", schemaVersion: 1, ruleset: "5e-2014", name: "H", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 18, cha: 10 }, race: "race:human", classes: [{ class: "class:druid", level, subclass: "subclass:circle-of-the-heammer" }], hp: { current: 30, temp: 0 } });

describe("Circle of the Heammer on screen", () => {
  it("Floar: its flame, with Zenith's sun from 14th level", () => {
    const low = druid(6);
    expect(opFx("useAction", { action: "floar", choice: "Fire" }, low, low)).toEqual([{ kind: "floar", radiant: false, zenith: false }]);
    const high = druid(14);
    const [e] = opFx("useAction", { action: "floar", choice: "Radiant" }, high, high);
    expect(e).toEqual({ kind: "floar", radiant: true, zenith: true });
    expect(specOf(e!)).toMatchObject({ at: "edge", look: "fx-floar fx-floar-radiant fx-zenith", label: "Floar · Zenith" });
  });
  it("Theros: the phenomenon's own look, with the days rolled", () => {
    const c = druid(10);
    const [e] = opFx("useAction", { action: "theros", choice: "Thawing Cold", rolled: 4 }, c, c);
    expect(e).toEqual({ kind: "theros", phenomenon: "Thawing Cold", days: 4 });
    expect(specOf(e!)).toMatchObject({ look: "fx-theros fx-theros-thaw", label: "Theros: Thawing Cold · 4 days" });
    expect(opFx("useAction", { action: "theros" }, c, c)).toEqual([]);
  });
});
