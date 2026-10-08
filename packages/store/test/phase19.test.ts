import { describe, expect, it } from "vitest";
import { buildItems, choiceOptions, derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
const ek = (level: number) => {
  const c = newCharacter({ id: "e", name: "Arcana", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 12, con: 14, int: 14, wis: 10, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, subclass: "subclass:eldritch-knight" };
  return c;
};

describe("Eldritch Knight and Arcane Trickster spellcasting", () => {
  it("slots follow the one-third caster table", () => {
    const slots = (l: number) => derive(ek(l), reg).spellSlots.filter((s) => s.total > 0).map((s) => s.total);
    expect(slots(3)).toEqual([2]);
    expect(slots(4)).toEqual([3]);
    expect(slots(7)).toEqual([4, 2]);
    expect(slots(13)).toEqual([4, 3, 2]);
    expect(slots(19)).toEqual([4, 3, 3, 1]);
  });

  it("spells known are leveled wizard spells up to the highest slot, mostly abjuration and evocation", () => {
    const c = ek(4);
    const item = buildItems(c, reg).find((i) => i.key === "feature:eldritch-knight-spellcasting|spells")!;
    expect(item).toMatchObject({ need: 4, slotMax: 1, freeSchool: 1 });
    const opts = choiceOptions(item.choice!, reg, item.slotMax);
    expect(opts.every((o) => /^Level 1,/.test(o.detail ?? ""))).toBe(true);
    expect(opts.some((o) => o.value === "spell:shield")).toBe(true);
    c.choices["feature:eldritch-knight-spellcasting"] = { spells: ["spell:shield", "spell:magic-missile", "spell:sleep", "spell:charm-person"] } as never;
    expect(derive(c, reg).spells.find((x) => x.id === "spell:shield")?.cast.slotLevels).toEqual([1]);
    expect(derive(c, reg).warnings.join(" ")).toMatch(/2 spells outside abjuration and evocation; you may have 1/);
    expect(buildItems(ek(8), reg).find((i) => i.key === "feature:eldritch-knight-spellcasting|spells")!.freeSchool).toBe(2);
  });

  it("an Arcane Trickster gets slots and its own spell picks", () => {
    const c = newCharacter({ id: "a", name: "A", race: "race:human", class: "class:rogue", abilities: { str: 8, dex: 16, con: 12, int: 14, wis: 10, cha: 12 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 7, subclass: "subclass:arcane-trickster" };
    expect(derive(c, reg).spellSlots.filter((s) => s.total > 0).map((s) => s.total)).toEqual([4, 2]);
    const item = buildItems(c, reg).find((i) => i.key === "feature:arcane-trickster-spellcasting|spells")!;
    expect(item).toMatchObject({ need: 5, slotMax: 2, freeSchool: 1 });
  });
});
