import { describe, expect, it } from "vitest";
import { rollFx } from "../src/fx/triggers.js";
import { specOf } from "../src/fx/FxLayer.js";
import type { RollRecord } from "../src/rolls.js";

const rec = (extra: Partial<RollRecord>): RollRecord => ({ id: "r", at: 0, title: "Fireball damage", kind: "damage", total: 33, crit: false, fumble: false, physical: false, lines: [], ...extra });
const info = (id: string) => (id === "spell:fireball" ? { id, name: "Fireball", level: 3, school: "evocation", damage: { type: "fire" } } : undefined);

describe("transmuted spells and Destructive Wrath on screen", () => {
  it("Fireball rolled as fire plays its own look", () => {
    expect(rollFx(rec({ spell: "spell:fireball", byType: { fire: 33 } }), undefined, info).map((e) => e.kind)).toEqual(["spell"]);
  });
  it("Fireball made thunder: not the fire look, the generated one in thunder", () => {
    const out = rollFx(rec({ spell: "spell:fireball", byType: { thunder: 33 } }), undefined, info);
    expect(out.map((e) => e.kind)).toEqual(["gen"]);
  });
  it("Destructive Wrath on the roll: its storm first, with a shake and a buzz", () => {
    const out = rollFx(rec({ spell: "spell:fireball", byType: { thunder: 48 }, options: ["Destructive Wrath"] }), undefined, info);
    expect(out[0]).toEqual({ kind: "wrath" });
    const spec = specOf({ kind: "wrath" });
    expect(spec).toMatchObject({ at: "edge", look: "fx-wrath", label: "Destructive Wrath · maximum" });
    expect(spec.shake).toBeGreaterThan(0);
  });
});
