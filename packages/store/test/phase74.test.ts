import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_811_000_000_000;
const cleric = (extra: (c: ReturnType<typeof newCharacter>) => void = () => {}) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: "class:cleric", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
  c.classes = [{ class: "class:cleric", level: 11, subclass: "subclass:life" }];
  c.hp = { current: 40, temp: 0 };
  extra(c);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("14d in play", () => {
  it("Heroes' Feast on you: the rolled increase raises current hit points too", () => {
    const l = cleric();
    l.record("castSpell", { spell: "spell:heroes-feast", list: "cleric", level: 6, using: "slot", selfEffect: true, choice: "13" });
    expect(l.character.effects.find((e) => e.effect === "effect:heroes-feast")).toMatchObject({ choice: "13", minutes: 1440 });
    expect(l.character.hp.current).toBe(53);
  });
  it("Lesser Restoration on you ends the picked condition and leaves no tag", () => {
    const l = cleric((c) => {
      c.effects = [
        { id: "p", effect: "condition:poisoned" },
        { id: "b", effect: "condition:blinded" },
      ];
    });
    expect(l.record("castSpell", { spell: "spell:lesser-restoration", list: "cleric", level: 2, using: "slot", selfEffect: true, choice: "Poisoned" }).join(" ")).toMatch(/poisoned ended/);
    expect(l.character.effects.map((e) => e.effect)).toEqual(["condition:blinded"]);
  });
  it("Greater Restoration takes off one exhaustion level; from + Effect too", () => {
    const l = cleric((c) => {
      c.effects = [{ id: "x", effect: "condition:exhaustion", level: 2 }];
    });
    l.record("castSpell", { spell: "spell:greater-restoration", list: "cleric", level: 5, using: "slot", selfEffect: true, choice: "One exhaustion level" });
    expect(l.character.effects.find((e) => e.effect === "condition:exhaustion")?.level).toBe(1);
    l.record("addEffect", { instanceId: "g2", effect: "effect:greater-restoration", choice: "One exhaustion level" });
    expect(l.character.effects).toEqual([]);
  });
});
