import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../../store/src/log.js";
import { HybridClock } from "../../store/src/clock.js";
import { ongoingFx, opFx, rollFx } from "../src/fx/triggers.js";
import { alignmentSide, phaseLook } from "../src/fx/spells.js";
import { specOf } from "../src/fx/FxLayer.js";
import type { RollRecord } from "../src/rolls.js";

const reg = tableRegistry();
let t = 1_803_000_000_000;
const cleric = (alignment?: string) => {
  const c = newCharacter({ id: "x", name: "X", race: "race:human", class: "class:cleric", abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 5 };
  if (alignment) c.alignment = alignment;
  c.spells.push({ spell: "spell:spirit-guardians", list: "cleric", prepared: true });
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const cast = (l: CharacterLog) => {
  const before = l.character;
  l.record("castSpell", { spell: "spell:spirit-guardians", list: "cleric", level: 3, using: "slot" });
  return opFx("castSpell", { spell: "spell:spirit-guardians", list: "cleric", level: 3, using: "slot" }, before, l.character, () => "Conjuration");
};
const dmg = (r: Partial<RollRecord>): RollRecord => ({ id: "r", at: 0, title: "", kind: "damage", total: 0, crit: false, fumble: false, physical: false, lines: [], ...r });

describe("Spirit Guardians: three looks by alignment", () => {
  it("the good/neutral/evil part of the alignment; not set, Unaligned and anything else: neutral", () => {
    expect(["LG", "NG", "CG", "Neutral good"].map(alignmentSide)).toEqual(["good", "good", "good", "good"]);
    expect(["LE", "NE", "CE", "chaotic evil"].map(alignmentSide)).toEqual(["evil", "evil", "evil", "evil"]);
    expect(["LN", "N", "TN", "CN", "Unaligned", "", undefined].map(alignmentSide)).toEqual(Array(7).fill("neutral"));
  });
  it("casting plays the alignment's gathering; concentrating keeps its orbit; alignment changes it without a new cast", () => {
    const l = cleric("LE");
    expect(cast(l)).toEqual([{ kind: "spell", spell: "spell:spirit-guardians", phase: "cast", mode: "evil" }]);
    expect(ongoingFx(l.character)?.look).toBe("sfx-ongoing-sg sfx-sg-evil");
    l.record("setDetails", { alignment: "NG" });
    expect(ongoingFx(l.character)?.look).toBe("sfx-ongoing-sg sfx-sg-good");
    l.record("endConcentration", {});
    expect(ongoingFx(l.character)).toBeUndefined();
    expect(ongoingFx(cleric().character)).toBeUndefined();
  });
  it("its damage: the alignment's lunge and the picked damage type's look, never deciding anything", () => {
    const l = cleric("CG");
    const ev = rollFx(dmg({ spell: "spell:spirit-guardians", byType: { necrotic: 12 } }), l.character);
    expect(ev).toEqual([
      { kind: "spell", spell: "spell:spirit-guardians", phase: "resolve", mode: "good" },
      { kind: "damage-type", type: "necrotic" },
    ]);
    expect(rollFx(dmg({ spell: "spell:spirit-guardians", again: true, byType: { radiant: 9 } }), cleric().character)[0]).toMatchObject({ phase: "again", mode: "neutral" });
    for (const side of ["good", "neutral", "evil"]) {
      expect(phaseLook("spell:spirit-guardians", "cast", side)?.look).toBe(`sfx-sg sfx-sg-${side}`);
      expect(specOf({ kind: "spell", spell: "spell:spirit-guardians", phase: "again", mode: side })).toMatchObject({ at: "hp", look: `sfx sfx-sg-strike sfx-sg-${side}` });
    }
  });
});
