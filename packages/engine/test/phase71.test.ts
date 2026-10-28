import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { summonOptions } from "../src/shapes.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const wiz = (effects: unknown[] = []) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 14, dex: 14, con: 14, int: 20, wis: 12, cha: 10 }, race: "race:human", classes: [{ class: "class:wizard", level: 17 }], hp: { current: 80, temp: 0 }, spells: [{ spell: "spell:wish", list: "wizard", prepared: true }], effects }), reg);

describe("13d additions: Wish, Simulacrum, Conjure Barrage and Volley", () => {
  it("Wish duplicating a spell: it's castable at will while the tag is on", () => {
    const s = wiz([{ id: "w", effect: "effect:wish-duplicate", choice: "spell:resurrection", rounds: 1 }]);
    const sp = s.spells.find((x) => x.id === "spell:resurrection");
    expect(sp?.cast.atWill).toBe(true);
    expect(wiz().spells.some((x) => x.id === "spell:resurrection")).toBe(false);
  });
  it("Wish's stress: Strength held at 3, the d100 and the necrotic dice", () => {
    const s = wiz([{ id: "x", effect: "effect:wish-stress", minutes: 4320 }]);
    expect(s.abilities.str.score.total).toBe(3);
    expect(s.abilities.str.score.parts.at(-1)?.label).toBe("At most 3 (Wish's stress)");
    expect(s.actions.find((a) => a.id === "wish-stress-again")?.roll).toBeDefined();
    expect(reg.get("effect:wish-stress", "effect").actions?.[0]?.roll?.table?.[32]).toBe("You can never cast Wish again.");
    expect(reg.get("effect:wish-stress", "effect").actions?.[0]?.roll?.table?.[33]).toBe("You can cast Wish again.");
  });
  it("Simulacrum: any beast or humanoid, one, half its hit points", () => {
    const sum = reg.list("summon").find((x) => x.spell === "spell:simulacrum")!;
    expect(sum.halfHp).toBe(true);
    const o = summonOptions(reg, sum.id, 7)!;
    expect(o.count).toBe(1);
    expect(o.creatures.some((c) => c.type === "humanoid") && o.creatures.some((c) => c.type === "beast")).toBe(true);
    expect(o.creatures.every((c) => c.type === "humanoid" || c.type === "beast")).toBe(true);
  });
  it("Conjure Barrage and Volley: the weapon's type picked, the dice to roll", () => {
    const b = wiz([{ id: "b", effect: "effect:conjure-barrage", choice: "piercing", rounds: 1 }]).actions.find((a) => a.id === "conjure-barrage-roll");
    expect(b?.roll?.text ?? "").toMatch(/3d8/);
    const v = wiz([{ id: "v", effect: "effect:conjure-volley", choice: "piercing", rounds: 1 }]).actions.find((a) => a.id === "conjure-volley-roll");
    expect(v?.roll?.text ?? "").toMatch(/8d8/);
  });
});
