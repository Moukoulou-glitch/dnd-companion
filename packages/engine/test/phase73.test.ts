import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
type It = { item: string; attuned?: boolean; chargesUsed?: number; base?: string };
const sheet = (classes: { class: string; level: number; subclass?: string }[], items: It[], extra: Record<string, unknown> = {}) =>
  derive(
    Character.parse({
      id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 14, dex: 14, con: 14, int: 16, wis: 16, cha: 16 }, race: "race:human", classes, hp: { current: 30, temp: 0 },
      inventory: items.map((x, i) => ({ id: `i${i}`, item: x.item, quantity: 1, equipped: true, attuned: x.attuned ?? true, ...(x.chargesUsed ? { chargesUsed: x.chargesUsed } : {}), ...(x.base ? { base: x.base } : {}) })),
      ...extra,
    }),
    reg,
  );

describe("13e limits fixed: wands and staffs cast with their charges", () => {
  it("Wand of Fireballs: 3 charges at 3rd, one more a level; its own DC 15; charges left on the wand", () => {
    const fb = sheet([{ class: "class:wizard", level: 5 }], [{ item: "item:wand-of-fireballs", chargesUsed: 2 }]).spells.find((s) => s.id === "spell:fireball" && s.cast.charges)!;
    expect(fb.cast.charges).toMatchObject({ instanceId: "i0", remaining: 5 });
    expect(fb.cast.charges!.options.slice(0, 3)).toEqual([{ level: 3, cost: 1 }, { level: 4, cost: 2 }, { level: 5, cost: 3 }]);
    expect(fb.save?.dc).toBe(15);
    expect(fb.cast.atWill).toBeUndefined();
  });
  it("Staff of Power: each spell's own cost and level; Staff of the Magi: some at will", () => {
    const sp = sheet([{ class: "class:wizard", level: 13 }], [{ item: "item:staff-of-power" }]).spells;
    expect(sp.find((s) => s.id === "spell:lightning-bolt" && s.cast.charges)?.cast.charges?.options).toEqual([{ level: 5, cost: 5 }]);
    expect(sp.find((s) => s.id === "spell:globe-of-invulnerability" && s.cast.charges)?.cast.charges?.options).toEqual([{ level: 6, cost: 6 }]);
    const magi = sheet([{ class: "class:wizard", level: 13 }], [{ item: "item:staff-of-the-magi" }]).spells;
    expect(magi.find((s) => s.id === "spell:detect-magic" && s.cast.atWill)).toBeDefined();
  });
});

describe("13e limits fixed: items", () => {
  it("Frost Brand as a greatsword: the greatsword's dice, its own name", () => {
    const a = sheet([{ class: "class:fighter", level: 5 }], [{ item: "item:frost-brand-longsword", base: "item:greatsword" }]).attacks.find((x) => x.name === "Frost Brand (Greatsword)")!;
    expect(a.damage.dice).toBe("2d6");
    expect(reg.get("item:frost-brand-longsword", "item").baseFrom).toContain("item:greatsword");
  });
  it("Winged Boots fly at your walking speed", () => {
    const s = sheet([{ class: "class:monk", level: 6 }], [{ item: "item:winged-boots" }], { toggles: ["winged-boots"] });
    const walk = s.speed.total;
    expect(s.speeds.find((x) => x.mode === "fly")?.total.total).toBe(walk);
    expect(walk).toBeGreaterThan(30);
  });
  it("Pearl of Power: one slot up to 3rd; Arcane Grimoire: one level more on Arcane Recovery", () => {
    expect(sheet([{ class: "class:wizard", level: 5 }], [{ item: "item:pearl-of-power" }]).actions.find((a) => a.id === "pearl-of-power")?.recoversSlots).toEqual({ budget: 3, maxLevel: 3, count: 1 });
    const ar = (items: It[]) => sheet([{ class: "class:wizard", level: 6 }], items).actions.find((a) => a.id === "arcane-recovery")?.recoversSlots?.budget;
    expect(ar([{ item: "item:arcane-grimoire-1" }])).toBe((ar([]) ?? 0) + 1);
  });
  it("Moon Sickle: healing spells 1d4 more; Periapt of Wound Closure: Hit Dice twice", () => {
    const cw = sheet([{ class: "class:druid", level: 5 }], [{ item: "item:moon-sickle-1" }]).spells.find((s) => s.id === "spell:cure-wounds");
    expect(cw?.heal?.bonus?.[1]).toEqual([{ label: "Moon Sickle +1", value: 0, dice: "1d4" }]);
    expect(sheet([{ class: "class:fighter", level: 5 }], [{ item: "item:periapt-of-wound-closure" }]).hitDieMultiplier).toEqual({ value: 2, label: "Periapt of Wound Closure" });
  });
});
