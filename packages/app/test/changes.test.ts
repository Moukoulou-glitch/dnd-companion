import { describe, expect, it } from "vitest";
import { changeValid, changesToModifiers, modifiersToChanges, type ChangeDraft } from "../src/components/ChangesEditor.js";

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
      { target: "check", abilities: ["str", "dex"], kind: "bonus", value: "-1" },
      { target: "ac", abilities: [], kind: "bonus", value: "2" },
      { target: "save", abilities: [], kind: "disadvantage", value: "" },
    ];
    expect(modifiersToChanges(changesToModifiers(rows, "Y"))).toEqual(rows);
  });
});
