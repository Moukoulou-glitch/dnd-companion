import { describe, expect, it } from "vitest";
import { derive, multiclassIssues, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();

describe("Ability maximums, permanent changes and multiclassing", () => {
  it("flags Ability Score Improvements that go above 20", () => {
    const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 12, con: 14, int: 17, wis: 10, cha: 8 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 8 };
    c.asi = [
      { class: "class:wizard", level: 4, abilities: { int: 2 } },
      { class: "class:wizard", level: 8, abilities: { int: 2 } },
    ] as never;
    const sheet = derive(c, reg);
    expect(sheet.abilities.int.score.total).toBe(22);
    expect(sheet.abilities.int.asiOver).toBe(true);
    expect(sheet.warnings.join(" ")).toMatch(/can't raise a score above 20/);
  });

  it("a permanent change counts, with a new maximum", () => {
    const c = newCharacter({ id: "f", name: "F", race: "race:human", class: "class:fighter", abilities: { str: 19, dex: 12, con: 14, int: 10, wis: 10, cha: 8 } }, reg);
    c.abilityAdjust.str = { bonus: 0, penalty: 0, penaltyEndsOnRest: false, permanent: [{ amount: 2, from: "Manual of Gainful Exercise", newMax: 22 }] };
    const sheet = derive(c, reg);
    expect(sheet.abilities.str.score.total).toBe(22);
    expect(sheet.abilities.str.max).toBe(22);
    expect(sheet.warnings.join(" ")).not.toMatch(/Strength is 22/);
  });

  it("multiclassing reads the scores as they stand, not the base scores", () => {
    const c = newCharacter({ id: "a", name: "Asmo", race: "race:human", class: "class:warlock", abilities: { str: 12, dex: 12, con: 14, int: 10, wis: 10, cha: 16 } }, reg);
    expect(multiclassIssues(c, reg, "class:paladin").length).toBe(0);
    c.abilityAdjust.str = { bonus: 0, penalty: 2, penaltyEndsOnRest: false };
    expect(multiclassIssues(c, reg, "class:paladin").join(" ")).toMatch(/Paladin needs/);
  });

  it("features with a save show their DC", () => {
    const c = newCharacter({ id: "m", name: "M", race: "race:human", class: "class:monk", abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 16, cha: 8 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 5 };
    const sheet = derive(c, reg);
    const f = sheet.features.find((x) => x.id === "feature:stunning-strike");
    // Human +1 Wisdom: 17, +3; 8 + 3 proficiency + 3.
    expect(f?.dc?.value).toBe(14);
    expect(f?.dc?.save).toBe("Constitution");
  });
});
