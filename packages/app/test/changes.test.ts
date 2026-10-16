import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { changeValid, changesToModifiers, describeChanges, modifiersToChanges, type ChangeDraft } from "../src/components/ChangesEditor.js";
import { tableRegistry } from "../../engine/test/helpers.js";

describe("Custom effect changes become the engine's modifiers", () => {
  it("all saves or checks, or only the chosen abilities; bonuses and penalties; advantage", () => {
    const rows: ChangeDraft[] = [
      { target: "save", abilities: [], kind: "bonus", value: "2" },
      { target: "check", abilities: ["str", "dex"], kind: "bonus", value: "-1" },
      { target: "ac", abilities: [], kind: "bonus", value: "1" },
      { target: "attack", abilities: [], kind: "bonus", value: "-1d4" },
      { target: "save", abilities: ["wis"], kind: "advantage", value: "" },
    ];
    expect(changesToModifiers(rows, "X")).toEqual([
      { selector: "roll.save.*", op: "add", value: 2, mode: "auto", label: "X" },
      { selector: "roll.check.str", op: "add", value: -1, mode: "auto", label: "X" },
      { selector: "roll.check.dex", op: "add", value: -1, mode: "auto", label: "X" },
      { selector: "stat.ac", op: "add", value: 1, mode: "auto", label: "X" },
      { selector: "roll.attack.*", op: "add", value: "-1d4", mode: "auto", label: "X" },
      { selector: "roll.save.wis", op: "advantage", mode: "auto", label: "X" },
    ]);
  });
  it("leaves out what can't apply: dice on AC, advantage on AC, an empty bonus", () => {
    expect(changeValid({ target: "ac", abilities: [], kind: "bonus", value: "1d4" })).toBe(false);
    expect(changeValid({ target: "ac", abilities: [], kind: "advantage", value: "" })).toBe(false);
    expect(changeValid({ target: "attack", abilities: [], kind: "bonus", value: "" })).toBe(false);
    expect(changesToModifiers([{ target: "speed", abilities: [], kind: "bonus", value: "-10" }], "Slow")).toEqual([{ selector: "stat.speed.walk", op: "add", value: -10, mode: "auto", label: "Slow" }]);
  });
  it("round-trips for editing a custom spell's effect", () => {
    const rows: ChangeDraft[] = [
      { target: "check", abilities: ["str", "dex"], kind: "penalty", value: "1" },
      { target: "ac", abilities: [], kind: "bonus", value: "2" },
      { target: "save", abilities: [], kind: "disadvantage", value: "" },
    ];
    expect(modifiersToChanges(changesToModifiers(rows, "Y"))).toEqual(rows);
  });
});

describe("Custom effects: an explicit Penalty, and skill checks", () => {
  it("a penalty takes the amount off, whatever sign was typed; a typed -1 bonus still works as before", () => {
    const mods = changesToModifiers(
      [
        { target: "attack", abilities: [], kind: "penalty", value: "2" },
        { target: "speed", abilities: [], kind: "penalty", value: "-10" },
        { target: "save", abilities: [], kind: "penalty", value: "1d4" },
        { target: "ac", abilities: [], kind: "bonus", value: "-1" },
      ],
      "Hex-ish",
    );
    expect(mods.map((m) => [m.selector, m.value])).toEqual([
      ["roll.attack.*", -2],
      ["stat.speed.walk", -10],
      ["roll.save.*", "-1d4"],
      ["stat.ac", -1],
    ]);
    expect(describeChanges(mods)).toEqual(["-2 to attack rolls", "-10 ft. to speed", "-1d4 to saving throws", "-1 to Armor Class"]);
    // Saved before Penalty existed (a negative bonus): opens as a penalty of that size.
    expect(modifiersToChanges([{ selector: "stat.ac", op: "add", value: -1, mode: "auto", label: "Old" }])).toEqual([{ target: "ac", abilities: [], kind: "penalty", value: "1" }]);
  });

  it("checks for chosen skills; a skill of a chosen ability isn't counted twice", () => {
    const rows: ChangeDraft[] = [{ target: "check", abilities: ["dex"], skills: ["stealth", "perception", "insight"], kind: "bonus", value: "2" }];
    expect(changesToModifiers(rows, "Cloak").map((m) => m.selector)).toEqual(["roll.check.dex", "roll.check.skill.perception", "roll.check.skill.insight"]);
    expect(describeChanges(changesToModifiers(rows, "Cloak"))).toEqual(["+2 to Dexterity, Perception, Insight ability checks"]);
    // Only skills: just those, never every check.
    const only: ChangeDraft[] = [{ target: "check", abilities: [], skills: ["athletics"], kind: "advantage", value: "" }];
    expect(changesToModifiers(only, "Enlarge")).toEqual([{ selector: "roll.check.skill.athletics", op: "advantage", mode: "auto", label: "Enlarge" }]);
    expect(modifiersToChanges(changesToModifiers(only, "Enlarge"))).toEqual(only);
  });

  it("the sheet applies a skill change to that skill (and its passive) only", () => {
    const reg = tableRegistry();
    const c = newCharacter({ id: "s", name: "S", race: "race:human", class: "class:rogue", abilities: { str: 10, dex: 14, con: 12, int: 10, wis: 12, cha: 10 } }, reg);
    const before = derive(c, reg);
    const mods = changesToModifiers([{ target: "check", abilities: [], skills: ["perception"], kind: "penalty", value: "5" }], "Fog");
    // A custom effect, as the Effects panel adds it.
    const after = derive({ ...c, effects: [{ id: "e1", effect: "custom", custom: { name: "Fog", modifiers: mods } }] }, reg);
    expect(after.skills.perception.total).toBe(before.skills.perception.total - 5);
    expect(after.passives.perception.total).toBe(before.passives.perception.total - 5);
    expect(after.skills.insight.total).toBe(before.skills.insight.total);
  });
});
