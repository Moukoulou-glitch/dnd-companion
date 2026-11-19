import { describe, expect, it } from "vitest";
import { buildItems, derive, newCharacter } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { tableRegistry } from "../../engine/test/helpers.js";
import { mostlyTwilight, rollFx } from "../src/fx/triggers.js";
import { swapSkills } from "../src/components/Builder";
import type { RollRecord } from "../src/rolls.js";

const reg = tableRegistry();
const roll = (r: Partial<RollRecord>): RollRecord => ({ id: "r", at: 0, title: "", kind: "d20", total: 0, crit: false, fumble: false, physical: false, lines: [], ...r });
const withClasses = (classes: Character["classes"]): Character => ({ ...newCharacter({ id: "c", name: "C", race: "race:human", class: "class:cleric", abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 } }, reg), classes });

describe("23n: a Twilight cleric's natural 20", () => {
  const tw = withClasses([{ class: "class:cleric", level: 5, subclass: "subclass:twilight-domain", hitDieRolls: [] } as never]);
  const half = withClasses([
    { class: "class:cleric", level: 3, subclass: "subclass:twilight-domain", hitDieRolls: [] } as never,
    { class: "class:fighter", level: 3, hitDieRolls: [] } as never,
  ]);
  it("only when most levels are Twilight cleric levels", () => {
    expect(mostlyTwilight(tw)).toBe(true);
    expect(mostlyTwilight(half)).toBe(false);
    expect(mostlyTwilight(withClasses([{ class: "class:cleric", level: 5, subclass: "subclass:life-domain", hitDieRolls: [] } as never]))).toBe(false);
  });
  it("any d20 showing 20 plays the starry shadow; an attack's crit look follows", () => {
    expect(rollFx(roll({ natural: 20 }), tw)).toEqual([{ kind: "twilight20" }]);
    expect(rollFx(roll({ attack: true, natural: 20, crit: true }), tw)).toEqual([{ kind: "twilight20" }, { kind: "crit" }]);
    expect(rollFx(roll({ attack: true, natural: 20, crit: true }), half)).toEqual([{ kind: "crit" }]);
    expect(rollFx(roll({ natural: 19 }), tw)).toEqual([]);
  });
});

describe("23n: skill choices can take any other skill", () => {
  it("lists the skills off the class's list that you don't have, and a pick from them fulfils the choice", () => {
    const c = newCharacter({ id: "k", name: "K", race: "race:human", class: "class:cleric", abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 } }, reg);
    const item = buildItems(c, reg).find((i) => i.kind === "choice" && i.choice?.kind === "skill" && i.source === "class:cleric")!;
    expect(item).toBeTruthy();
    const options = (item.choice!.from ?? []).map((v) => ({ value: v }));
    const others = swapSkills(item, options, new Map([["stealth", "You already have it."]])).map((o) => o.value);
    expect(others).toContain("animalHandling");
    expect(others).not.toContain("insight");
    expect(others).not.toContain("stealth");
    c.choices["class:cleric"] = { [item.choice!.id]: ["animalHandling", "religion"] };
    const after = buildItems(c, reg).find((i) => i.key === item.key)!;
    expect(after.done).toBe(true);
    expect(derive(c, reg).skills.animalHandling.proficiency).toBe(1);
  });
});
