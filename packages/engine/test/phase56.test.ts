import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { friendlyTargets, SPELL_TARGETS, targetWarnings } from "../src/targets.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const cleric = (level: number, extra: Record<string, unknown> = {}) =>
  Character.parse({ id: "c", schemaVersion: 1, ruleset: "5e-2014", name: "Clera", abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10 }, race: "race:human", classes: [{ class: "class:cleric", level, subclass: "subclass:life" }], hp: { current: 30, temp: 0 }, spells: [{ spell: "spell:cure-wounds", list: "cleric", prepared: true }, { spell: "spell:healing-word", list: "cleric", prepared: true }], ...extra });

describe("9e: healing on others, Disciple of Life, Blessed Healer, who can be targeted", () => {
  it("Disciple of Life adds 2 + the slot level; Blessed Healer gives you 2 + the slot level from 6th", () => {
    const s1 = derive(cleric(1), reg);
    const cw = s1.spells.find((x) => x.id === "spell:cure-wounds")!;
    expect(cw.heal?.bonus?.[1]).toEqual([{ label: "Disciple of Life", value: 3 }]);
    expect(cw.heal?.bonus?.[3]).toEqual([{ label: "Disciple of Life", value: 5 }]);
    expect(cw.heal?.selfIfOthers).toBeUndefined();
    const s6 = derive(cleric(6), reg);
    expect(s6.spells.find((x) => x.id === "spell:healing-word")!.heal?.selfIfOthers?.[2]).toEqual([{ label: "Blessed Healer", value: 4 }]);
  });
  it("targets: you, and a summoned creature; Cure Wounds warns on undead, never blocks", () => {
    const c = cleric(5, { summons: [{ id: "z1", creature: "creature:zombie", hp: 10, spell: "spell:animate-dead", group: "g1" }] });
    const ts = friendlyTargets(c, derive(c, reg), reg);
    expect(ts.map((t) => [t.id, t.type])).toEqual([
      ["me", "humanoid"],
      ["summon:z1", "undead"],
    ]);
    expect(targetWarnings(ts[1]!, SPELL_TARGETS["spell:cure-wounds"], "Cure Wounds")[0]).toMatch(/no effect on undead: Zombie is an undead/);
    expect(targetWarnings(ts[0]!, SPELL_TARGETS["spell:cure-wounds"], "Cure Wounds")).toEqual([]);
  });
  it("hearing and willing: a deafened or unconscious target is warned about", () => {
    const t = { id: "x", kind: "companion" as const, name: "Wolf", type: "beast", effects: ["condition:deafened"], hp: 5, max: 11 };
    expect(targetWarnings(t, { hear: true }, "Bardic Inspiration")[0]).toMatch(/hear you, and is deafened/);
    expect(targetWarnings({ ...t, effects: ["condition:unconscious"] }, { willing: true }, "Haste")[0]).toMatch(/willing, and is unconscious/);
    expect(targetWarnings({ ...t, kind: "me" }, { notSelf: true }, "Bardic Inspiration")[0]).toMatch(/someone other than you/);
  });
});

describe("Spiritual Weapon's later attacks; Spirit Guardians' damage type", () => {
  it("while Spiritual Weapon lasts: a bonus-action attack that rolls the spell, tied to its effect", () => {
    const s = derive(cleric(5, { spells: [{ spell: "spell:spiritual-weapon", list: "cleric", prepared: true }, { spell: "spell:spirit-guardians", list: "cleric", prepared: true }], effects: [{ id: "sw", effect: "effect:spiritual-weapon", rounds: 10, castLevel: 4 }] }), reg);
    const a = s.actions.find((x) => x.id === "spiritual-weapon-attack")!;
    expect(a).toMatchObject({ economy: "bonus", rollsSpell: "spell:spiritual-weapon", effectInstanceId: "sw" });
    expect(s.spells.find((x) => x.id === "spell:spiritual-weapon")!.damage!.byLevel[4]).toMatch(/^2d8/);
    expect(s.spells.find((x) => x.id === "spell:spirit-guardians")!.typeChoices).toEqual([{ kind: "spell", label: "the spell's choice", options: ["radiant", "necrotic"] }]);
  });
});
