import { describe, expect, it } from "vitest";
import { derive, newCharacter, shapeIssues, shapeKindOf } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_830_000_000_000;
const wizard = (level: number) => {
  const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level };
  for (const s of ["polymorph", "true-polymorph", "shapechange"]) c.spells.push({ spell: `spell:${s}`, list: "wizard", prepared: true });
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const cast = (l: CharacterLog, spell: string, level: number) => l.record("castSpell", { spell: `spell:${spell}`, list: "wizard", level, using: "slot", selfEffect: true });
const effectOf = (l: CharacterLog, id: string) => l.character.effects.find((e) => e.effect === id)!.id;

describe("Polymorph, True Polymorph and Shapechange on yourself", () => {
  it("each effect names its picker", () => {
    expect(shapeKindOf(reg.get("effect:polymorph", "effect").transform!)).toBe("polymorph");
    expect(shapeKindOf(reg.get("effect:true-polymorph", "effect").transform!)).toBe("truepolymorph");
    expect(shapeKindOf(reg.get("effect:shapechange", "effect").transform!)).toBe("shapechange");
  });

  it("Polymorph on yourself: the effect goes on, then the beast; its form at 0 HP ends the spell", () => {
    const l = wizard(7);
    cast(l, "polymorph", 4);
    l.record("transform", { kind: "polymorph", creature: "creature:giant-ape", uses: 0, effect: effectOf(l, "effect:polymorph") });
    expect(l.character.shape).toMatchObject({ kind: "polymorph", creature: "creature:giant-ape", ownSpell: true });
    l.record("damage", { amount: 500 });
    expect(l.character.shape).toBeUndefined();
    expect(l.character.concentration).toBeUndefined();
  });

  it("True Polymorph's form at 0 HP ends the spell too (it ended only Polymorph before)", () => {
    const l = wizard(17);
    cast(l, "true-polymorph", 9);
    l.record("transform", { kind: "truepolymorph", creature: "creature:giant-ape", uses: 0, effect: effectOf(l, "effect:true-polymorph") });
    l.record("damage", { amount: 157 });
    expect(l.character.shape).toBeUndefined();
    expect(l.character.concentration).toBeUndefined();
  });

  it("Shapechange: up to your level, not constructs or undead; your mind stays", () => {
    const ape = reg.get("creature:giant-ape", "creature");
    expect(shapeIssues(ape, "shapechange", undefined, 17)).toEqual([]);
    expect(shapeIssues(ape, "shapechange", undefined, 5)[0]).toMatch(/above 5 \(your level\)/);
    expect(shapeIssues(reg.get("creature:zombie", "creature"), "shapechange", undefined, 17)[0]).toMatch(/construct or an undead/);
    const l = wizard(17);
    cast(l, "shapechange", 9);
    l.record("transform", { kind: "shapechange", creature: "creature:giant-ape", uses: 0, effect: effectOf(l, "effect:shapechange") });
    const shape = derive(l.character, reg).shape!;
    expect(shape.kind).toBe("shapechange");
    expect(shape.abilities.int).toMatchObject({ score: 19, mine: true }); // 18 + 1 (human)
    expect(shape.abilities.str.mine).toBe(false);
    expect(shape.notes.join(" ")).toMatch(/As an action while the spell lasts, you can take another form/);
  });

  it("Shapechange: another form takes an action in combat; the form at 0 HP leaves the spell going; changing back ends it", () => {
    const l = wizard(17);
    cast(l, "shapechange", 9);
    const effect = effectOf(l, "effect:shapechange");
    l.record("transform", { kind: "shapechange", creature: "creature:giant-ape", uses: 0, effect });
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("transform", { kind: "shapechange", creature: "creature:brown-bear", uses: 0, effect });
    expect(l.character.combat?.action).toBe(1);
    l.record("damage", { amount: 34 });
    expect(l.character.shape).toBeUndefined();
    expect(l.character.concentration?.spell).toBe("spell:shapechange");
    l.record("transform", { kind: "shapechange", creature: "creature:brown-bear", uses: 0, effect });
    l.record("revert", {});
    expect(l.character.concentration).toBeUndefined();
  });
});
