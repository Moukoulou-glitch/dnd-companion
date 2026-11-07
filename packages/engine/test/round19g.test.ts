import { describe, expect, it } from "vitest";
import { bookPack, derive, newCharacter } from "../src/index.js";
import { loadPackDir, tableRegistry } from "./helpers.js";
import { ContentRegistry } from "../src/registry.js";

// Invented item text in the layout of a loaded items file; no book text is used here.
const ITEMS = `#### Longsword

Weapon, Martial Weapon, Melee Weapon, 3 lb.

1d8 Slashing

versatile (1d10)

---

#### Rimecut

Generic Variant, Rare (Requires Attunement)

---

Invented text for a generic blade.

***Base items.*** This item variant can be applied to the following base items:

- *Longsword* (*Rimecut Longsword*)

---

#### Rimecut Longsword

Weapon (*Longsword*), Rare (Requires Attunement), Martial Weapon, Melee Weapon, 3 lb.

1d8 Slashing

versatile (1d10)

---

When you hit with an attack using this magic blade, the target takes an extra 2d4 lightning damage. While you hold the blade, you have resistance to cold damage.

When you hit an aberration with it, that target takes an extra 1d10 psychic damage.

---

#### Longsword of Severing

Weapon (*Longsword*), Very Rare (Requires Attunement), Martial Weapon, Melee Weapon, 3 lb.

1d8 Slashing

---

When you strike a creature with this weapon and roll a 20 on the attack roll, that target takes an extra 11 slashing damage. Then roll another d20. If you roll a 20, its tail comes clean off.

---

#### Longsword of Draining

Weapon (*Longsword*), Rare (Requires Attunement), Martial Weapon, Melee Weapon, 3 lb.

1d8 Slashing

---

When you roll a 20 on the attack roll with this weapon, the target takes an extra 5 necrotic damage unless it's a golem. You gain 5 temporary hit points.

---

#### Cruel Longsword

Weapon (*Longsword*), Rare, Martial Weapon, Melee Weapon, 3 lb.

1d8 Slashing

---

When you roll a 20 with this magic weapon, the target takes an extra 6 slashing damage.

---

#### Vorpal Sword

Generic Variant, Legendary (Requires Attunement)

---

Invented text.

- *Longsword* (*Vorpal Longsword*)

---

#### Vorpal Longsword

Weapon (*Longsword*), Legendary (Requires Attunement), Martial Weapon, Melee Weapon, 3 lb.

1d8 Slashing

---

Invented text, nothing the parser reads.
`;

const reg = tableRegistry();
const { pack } = bookPack([{ name: "items-sublist.md", text: ITEMS }], reg);
const get = (id: string) => pack.definitions.find((d) => d.id === id) as any;
const all = new ContentRegistry([loadPackDir("content/packs/srd-5.1"), loadPackDir("content/packs/table-2014"), pack]);
const fighter = (item: string) => {
  const c = newCharacter({ id: "f", name: "F", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, all);
  c.classes = [{ class: "class:fighter", level: 5 }];
  c.inventory.push({ id: "w", item, quantity: 1, equipped: true, attuned: true } as any);
  const s = derive(c, all);
  return { s, atk: s.attacks.find((a) => a.itemInstanceId === "w")! };
};

describe("19g: magic weapon text that works", () => {
  it("extra damage on every hit and a resistance while held, either word order", () => {
    expect(get("item:rimecut-longsword").grant.modifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: "defense.resist.cold", op: "resist" }),
        expect.objectContaining({ selector: "item.damage", op: "add", value: "2d4", damageType: "lightning" }),
        expect.objectContaining({ selector: "item.damage", value: "1d10", damageType: "psychic", mode: "suggested", when: { text: "against an aberration" } }),
      ]),
    );
    const { s, atk } = fighter("item:rimecut-longsword");
    expect(s.defenses.resist).toContain("cold");
    expect(atk.damage.bonus.dice).toEqual(expect.arrayContaining([expect.objectContaining({ dice: "2d4", damageType: "lightning" })]));
  });
  it("on a 20: flat damage added, a second d20 for what more it does", () => {
    const { atk } = fighter("item:longsword-of-severing");
    expect(atk.damage.onCrit).toEqual([{ label: "Longsword of Severing (a 20)", value: 11, damageType: "slashing" }]);
    expect(atk.damage.critRiders).toEqual([{ label: "Longsword of Severing", text: "Its tail comes clean off.", d20: true }]);
  });
  it("on a 20 with more to it (who it doesn't work on, temporary HP): shown with the damage", () => {
    const { atk } = fighter("item:longsword-of-draining");
    expect(atk.damage.onCrit[0]!.value).toBe(5);
    expect(atk.damage.critRiders![0]!.text).toMatch(/5 temporary hit points/);
    // A plain one (only the damage): no note.
    expect(fighter("item:cruel-longsword").atk.damage).toMatchObject({ onCrit: [{ value: 6 }] });
    expect(fighter("item:cruel-longsword").atk.damage.critRiders).toBeUndefined();
  });
  it("made from a generic variant the app has: works like the app's own (Vorpal Sword)", () => {
    const v = get("item:vorpal-longsword");
    expect(v.grant).toEqual(reg.find("item:vorpal-sword", "item")!.grant);
    expect(v.magic.bonus).toBe(3);
  });
});

describe("19g: Sword of Sharpness, Sword of Life Stealing, Mace of Smiting", () => {
  it("Sharpness: 14 more on a 20, then a d20 for a limb; maximum dice against objects", () => {
    const { atk } = fighter("item:sword-of-sharpness");
    expect(atk.damage.onCrit).toEqual([{ label: "Sword of Sharpness (a 20)", value: 14, damageType: "slashing" }]);
    expect(atk.damage.critRiders).toEqual([expect.objectContaining({ label: "Sword of Sharpness", d20: true })]);
    expect(atk.damage.bonus.suggestions.some((x) => x.label === "Sword of Sharpness" && x.apply.maximize)).toBe(true);
  });
  it("Life Stealing: 10 on a 20, with its temporary hit points noted", () => {
    const { atk } = fighter("item:sword-of-life-stealing");
    expect(atk.damage.onCrit[0]).toMatchObject({ value: 10, damageType: "necrotic" });
    expect(atk.damage.critRiders![0]!.text).toMatch(/10 temporary hit points/);
  });
  it("Mace of Smiting: +1, +2 more against a construct as a tick-box, 7 on a 20", () => {
    const { atk } = fighter("item:mace-of-smiting");
    expect(atk.damage.onCrit[0]!.value).toBe(7);
    expect(atk.attack.suggestions.some((x) => /construct/.test(x.label))).toBe(true);
  });
});
