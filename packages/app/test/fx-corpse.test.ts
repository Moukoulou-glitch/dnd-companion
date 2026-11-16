import { describe, expect, it } from "vitest";
import { rollFx } from "../src/fx/triggers.js";
import { specOf } from "../src/fx/FxLayer.js";
import type { RollRecord } from "../src/rolls.js";

const rec = (extra: Partial<RollRecord>): RollRecord => ({ id: "r", at: 0, title: "Corpse Slayer", kind: "d20", attack: true, total: 25, crit: false, fumble: false, physical: false, lines: [], ...extra });

describe("Corpse Slayer's critical hits on screen", () => {
  it("its critical hit has its own look instead of the usual crit", () => {
    expect(rollFx(rec({ crit: true }))).toEqual([{ kind: "corpse", smite: false }]);
    expect(rollFx(rec({ title: "Longsword", crit: true }))).toEqual([{ kind: "crit" }]);
    expect(specOf({ kind: "corpse", smite: false })).toMatchObject({ at: "edge", look: "fx-cs", label: "Corpse Slayer · critical hit" });
  });
  it("its critical damage with a Divine Smite: the radiant one, bigger", () => {
    const dmg = (options: string[], title = "Corpse Slayer damage (critical)") => rollFx(rec({ kind: "damage", attack: false, title, options, byType: { slashing: 30, radiant: 18 } }));
    expect(dmg(["Divine Smite"])[0]).toEqual({ kind: "corpse", smite: true });
    expect(dmg([]).some((e) => e.kind === "corpse")).toBe(false);
    expect(dmg(["Divine Smite"], "Corpse Slayer damage").some((e) => e.kind === "corpse")).toBe(false);
    const s = specOf({ kind: "corpse", smite: true });
    expect(s.look).toBe("fx-cs fx-cs-smite");
    expect(s.ms).toBeGreaterThan(specOf({ kind: "corpse", smite: false }).ms);
  });
});
