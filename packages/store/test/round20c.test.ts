import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_900_000_000_000;
const pc = (items: { item: string; picks?: string[] }[], cls = "class:fighter") => {
  const c = newCharacter({ id: "f", name: "F", race: "race:human", class: cls, abilities: { str: 16, dex: 14, con: 14, int: 12, wis: 10, cha: 10 } }, reg);
  c.classes = [{ class: cls, level: 5 }];
  items.forEach((x, i) => c.inventory.push({ id: `i${i}`, item: x.item, quantity: 1, equipped: true, attuned: true, ...(x.picks ? { picks: x.picks } : {}) } as never));
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const sheet = (l: CharacterLog) => derive(l.character, reg);

describe("20c: summoned helpers", () => {
  it("figurines, horns, bags, elemental vessels and gems open their summon; their uses are tracked", () => {
    const s = sheet(pc([{ item: "item:figurine-of-wondrous-power-golden-lions" }, { item: "item:horn-of-valhalla-brass" }, { item: "item:bag-of-tricks-gray" }, { item: "item:brazier-of-commanding-fire-elementals" }, { item: "item:elemental-gem-emerald" }]));
    const a = (id: string) => s.actions.find((x) => x.id === id)!;
    expect(a("figurine-golden-lions")).toMatchObject({ everyDays: 7 });
    expect(a("horn-of-valhalla-brass").everyDays).toBe(7);
    expect(a("bag-of-tricks-gray").cost?.remaining).toBe(3);
    expect(a("bag-of-tricks-gray").roll?.table).toHaveLength(8);
    expect(a("brazier-of-commanding-fire-elementals").cost?.remaining).toBe(1);
    expect(reg.find("summon:figurine-golden-lions", "summon")).toMatchObject({ creatures: ["creature:lion"], count: { "1": 2 } });
    expect(reg.find("summon:horn-of-valhalla-brass", "summon")?.countDice).toBe("3d4+3");
    expect(reg.find("summon:elemental-water", "summon")).toMatchObject({ concentration: true, creatures: ["creature:water-elemental"] });
    for (const id of ["figurine-golden-lions", "horn-of-valhalla-brass", "bag-of-tricks-gray", "brazier-of-commanding-fire-elementals", "elemental-gem-emerald"]) expect(a(id).opensSummon, id).toBeTruthy();
  });
});

describe("20c: rods, Tasha's and others", () => {
  it("Rod of Lordly Might: +3 mace, flaming blade 2d6 fire while on, three once-a-dawn properties", () => {
    const l = pc([{ item: "item:rod-of-lordly-might" }]);
    const mace = () => sheet(l).attacks.find((x) => x.itemInstanceId === "i0" && !x.offHand)!;
    expect(mace().attack.parts.find((p) => p.label === "Magic weapon")?.value).toBe(3);
    expect(mace().damage.bonus.dice.some((d) => d.dice === "2d6")).toBe(false);
    l.record("useAction", { action: "lordly-flame" });
    expect(mace().damage.bonus.dice).toEqual(expect.arrayContaining([expect.objectContaining({ dice: "2d6", damageType: "fire" })]));
    expect(sheet(l).resources.filter((r) => r.id.startsWith("lordly-"))).toHaveLength(3);
  });
  it("Absorbing Tattoo: its colour's resistance; Eldritch Claw: the maul's 1d6 force while on", () => {
    expect(sheet(pc([{ item: "item:absorbing-tattoo", picks: ["thunder"] }])).defenses.resist).toContain("thunder");
    const l = pc([{ item: "item:eldritch-claw-tattoo" }, { item: "item:longsword" }]);
    l.record("useAction", { action: "eldritch-maul" });
    const sw = sheet(l).attacks.find((x) => x.itemInstanceId === "i1" && !x.offHand)!;
    expect(sw.damage.bonus.dice).toEqual(expect.arrayContaining([expect.objectContaining({ dice: "1d6", damageType: "force" })]));
  });
  it("Hat of Wizardry asks an Arcana check; Plate Armor of Etherealness casts Etherealness once a dawn; a broom flies you", () => {
    const s = sheet(pc([{ item: "item:hat-of-wizardry" }, { item: "item:plate-armor-of-etherealness" }, { item: "item:driftglobe" }], "class:wizard"));
    expect(s.actions.find((a) => a.id === "hat-of-wizardry")?.check).toMatchObject({ skills: ["arcana"], dc: 10 });
    expect(s.spells.some((x) => x.id === "spell:etherealness")).toBe(true);
    expect(s.spells.some((x) => x.id === "spell:daylight")).toBe(true);
    const b = pc([{ item: "item:broom-of-flying" }]);
    b.record("useAction", { action: "broom-of-flying" });
    expect(sheet(b).speeds.find((x) => x.mode === "fly")?.total.total).toBe(50);
  });
});
