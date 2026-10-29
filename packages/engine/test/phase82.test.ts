import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const mk = (classes: unknown, effects: unknown[] = []) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 16, cha: 16 }, race: "race:human", classes, effects, inventory: [{ id: "w", item: "item:longsword", quantity: 1, equipped: true, attuned: false }], hp: { current: 30, temp: 0 } }), reg);
const opt = (s: ReturnType<typeof derive>, label: string) => s.attacks.find((a) => a.name === "Longsword")!.damage.bonus.suggestions.find((x) => x.label === label);

describe("extra damage carries its own type", () => {
  it("Divine Favor's 1d4 is radiant", () => {
    const s = mk([{ class: "class:paladin", level: 2 }], [{ id: "d", effect: "effect:divine-favor" }]);
    expect(s.attacks.find((a) => a.name === "Longsword")!.damage.bonus.dice).toEqual([expect.objectContaining({ dice: "1d4", damageType: "radiant" })]);
  });
  it("Elemental Weapon, Spirit Shroud, Absorb Elements: the type picked on their tag", () => {
    expect(opt(mk([{ class: "class:paladin", level: 5 }], [{ id: "e", effect: "effect:elemental-weapon", choice: "thunder", castLevel: 3 }]), "Elemental Weapon")?.apply.damageType).toBe("thunder");
    expect(opt(mk([{ class: "class:paladin", level: 5 }], [{ id: "s", effect: "effect:spirit-shroud", choice: "cold", castLevel: 3 }]), "Spirit Shroud")?.apply.damageType).toBe("cold");
  });
  it("so Destructive Wrath can max Elemental Weapon's thunder dice on a Tempest cleric's hit", () => {
    const s = mk([{ class: "class:cleric", level: 5, subclass: "subclass:tempest-domain" }], [{ id: "e", effect: "effect:elemental-weapon", choice: "thunder", castLevel: 3 }]);
    expect(opt(s, "Elemental Weapon")?.apply.damageType).toBe("thunder");
    expect(opt(s, "Destructive Wrath")?.forTypes).toEqual(["lightning", "thunder"]);
  });
});

describe("Goodberry with Disciple of Life", () => {
  it("a Life cleric's berries offer Disciple of Life's 2 + 1 (the table decides)", () => {
    const life = mk([{ class: "class:cleric", level: 1, subclass: "subclass:life" }], [{ id: "g", effect: "effect:goodberry", minutes: 1440 }]);
    expect(life.effects.find((e) => e.instanceId === "g")?.counter?.use).toEqual({ label: "Eat a berry", heal: 1, bonus: [{ label: "Disciple of Life", value: 3 }] });
    const druid = mk([{ class: "class:druid", level: 1 }], [{ id: "g", effect: "effect:goodberry", minutes: 1440 }]);
    expect(druid.effects.find((e) => e.instanceId === "g")?.counter?.use?.bonus).toBeUndefined();
  });
});
