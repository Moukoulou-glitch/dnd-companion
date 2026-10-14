import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import type { SpellDef } from "@dnd/schema";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../../store/src/log.js";
import { HybridClock } from "../../store/src/clock.js";
import { ongoingFx, opFx, rollFx } from "../src/fx/triggers.js";
import { SPELL_FX, phaseLook } from "../src/fx/spells.js";
import { specOf } from "../src/fx/FxLayer.js";
import type { RollRecord } from "../src/rolls.js";

const reg = tableRegistry();
let t = 1_800_000_000_000;
const NATURE = ["spell:thorn-whip", "spell:entangle", "spell:spike-growth", "spell:grasping-vine", "spell:maximilians-earthen-grasp"];
const druid = (level: number) => {
  const c = newCharacter({ id: "d", name: "D", race: "race:human", class: "class:druid", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const fx = (l: CharacterLog, type: string, payload: unknown) => {
  const before = l.character;
  l.record(type as never, payload as never);
  return opFx(type, payload, before, l.character);
};
const dmg = (r: Partial<RollRecord>): RollRecord => ({ id: "r", at: 0, title: "", kind: "damage", total: 0, crit: false, fumble: false, physical: false, lines: [], ...r });

describe("Grasping Vine and Maximilian's Earthen Grasp placeholders", () => {
  it("are spells the app knows, in our own words with no book text", () => {
    const vine = reg.find("spell:grasping-vine", "spell") as SpellDef;
    const grasp = reg.find("spell:maximilians-earthen-grasp", "spell") as SpellDef;
    expect(vine).toMatchObject({ level: 4, school: "Conjuration", castingTime: "1 bonus action", concentration: true, classes: ["druid", "ranger"], text: [] });
    expect(grasp).toMatchObject({ level: 2, school: "Transmutation", concentration: true, classes: ["sorcerer", "wizard"], save: { ability: "str", onSuccess: "none" }, damage: { type: "bludgeoning" }, text: [] });
    expect(vine.summary).toMatch(/Placeholder/);
    // The Nature domain's 7th-level spell now resolves.
    const cleric = newCharacter({ id: "c", name: "C", race: "race:human", class: "class:cleric", abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
    cleric.classes[0] = { ...cleric.classes[0]!, level: 7, subclass: "subclass:nature-domain" };
    expect(derive(cleric, reg).spells.some((s) => s.id === "spell:grasping-vine")).toBe(true);
  });
});

describe("Nature spell effects", () => {
  it("each grows up from the ground when cast", () => {
    for (const id of NATURE) {
      expect(SPELL_FX[id]?.family).toBe("nature");
      expect(phaseLook(id, "cast")?.at).toBe("ground");
      expect(specOf({ kind: "spell", spell: id, phase: "cast" }).at).toBe("ground");
    }
  });

  it("casting plays the spell's own look, recorded like any cast", () => {
    const l = druid(5);
    l.record("learnSpell", { spell: "spell:entangle", list: "druid" });
    l.record("learnSpell", { spell: "spell:thorn-whip", list: "druid" });
    expect(fx(l, "castSpell", { spell: "spell:thorn-whip", list: "druid", level: 0, using: "none" })).toEqual([{ kind: "spell", spell: "spell:thorn-whip", phase: "cast" }]);
    const e = fx(l, "castSpell", { spell: "spell:entangle", list: "druid", level: 1, using: "slot" });
    expect(e).toEqual([{ kind: "spell", spell: "spell:entangle", phase: "cast" }]);
  });

  it("damage: Thorn Whip's sting and the earthen hand's crush replace the plain damage-type look; later uses play the short one", () => {
    expect(rollFx(dmg({ spell: "spell:thorn-whip", byType: { piercing: 5 } }))).toEqual([{ kind: "spell", spell: "spell:thorn-whip", phase: "resolve" }]);
    expect(rollFx(dmg({ spell: "spell:maximilians-earthen-grasp", byType: { bludgeoning: 7 } }))).toEqual([{ kind: "spell", spell: "spell:maximilians-earthen-grasp", phase: "resolve" }]);
    expect(rollFx(dmg({ spell: "spell:maximilians-earthen-grasp", again: true, byType: { bludgeoning: 7 } }))).toEqual([{ kind: "spell", spell: "spell:maximilians-earthen-grasp", phase: "again" }]);
    expect(rollFx(dmg({ spell: "spell:spike-growth", again: true, byType: { piercing: 4 } }))).toEqual([{ kind: "spell", spell: "spell:spike-growth", phase: "again" }]);
    // Grasping Vine deals no damage: nothing of its own to replay.
    expect(phaseLook("spell:grasping-vine", "again")).toBeUndefined();
  });

  it("the low band at the bottom stays while you concentrate, and goes with concentration", () => {
    const l = druid(5);
    l.record("learnSpell", { spell: "spell:entangle", list: "druid" });
    l.record("castSpell", { spell: "spell:entangle", list: "druid", level: 1, using: "slot" });
    expect(ongoingFx(l.character)).toEqual({ spell: "spell:entangle", look: "sfx-ongoing-vines" });
    l.record("endConcentration", {});
    expect(ongoingFx(l.character)).toBeUndefined();
  });
});
