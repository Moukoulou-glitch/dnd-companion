import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 2_600_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");

describe("proficiencies by hand, armor feats, Tasha's options, all the subclasses", () => {
  it("weapon and armor proficiencies can be added by hand", () => {
    const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 10, cha: 8 } }, reg);
    c.extras.push({ id: "x1", kind: "armor", value: "medium", tag: "DM allows", reason: "" }, { id: "x2", kind: "weapon", value: "longsword", tag: "Backstory", reason: "" });
    const s = derive(c, reg);
    expect(s.proficiencies.armor).toContain("medium");
    expect(s.proficiencies.weapons).toContain("longsword");
  });

  it("Heavily Armored gives heavy armor", () => {
    const c = newCharacter({ id: "f", name: "F", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 10, cha: 8 } }, reg);
    c.extras.push({ id: "x", kind: "feat", value: "feat:heavily-armored", tag: "DM allows", reason: "" });
    expect(derive(c, reg).proficiencies.armor).toContain("heavy");
  });

  it("a Kensei picks weapons that become proficiencies; Tasha's monk features are there", () => {
    const c = newCharacter({ id: "k", name: "K", race: "race:human", class: "class:monk", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 16, cha: 8 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 6, subclass: "subclass:way-of-the-kensei" };
    const kensei = reg.find("feature:way-of-the-kensei-path-of-the-kensei", "feature")!;
    const choice = kensei.choices!.find((x) => x.id === "kensei-weapons")!;
    c.choices[kensei.id] = { [choice.id]: ["longsword", "longbow", "warhammer"] } as never;
    const s = derive(c, reg);
    expect(s.proficiencies.weapons).toEqual(expect.arrayContaining(["longsword", "longbow", "warhammer"]));
    const names = s.features.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["Dedicated Weapon", "Ki-Fueled Attack", "Quickened Healing", "Focused Aim", "Path of the Kensei"]));
  });

  it("every class has its PHB, Xanathar's and Tasha's subclasses", () => {
    const count = (cls: string) => reg.list("subclass").filter((s) => s.class === cls).length;
    const want: Record<string, number> = {
      "class:barbarian": 7, "class:bard": 7, "class:cleric": 12, "class:druid": 7, "class:fighter": 8, "class:monk": 8,
      "class:paladin": 7, "class:ranger": 7, "class:rogue": 9, "class:sorcerer": 7, "class:warlock": 8, "class:wizard": 11,
    };
    for (const [cls, n] of Object.entries(want)) expect([cls, count(cls)]).toEqual([cls, n]);
  });
});
