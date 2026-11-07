import { describe, expect, it } from "vitest";
import { bookPack } from "../src/index.js";
import { tableRegistry } from "./helpers.js";

// Invented items in the layout of a loaded items file; no book text is used here.
const ITEMS = `#### Lantern of Little Suns

Wondrous Item, Rare (Requires Attunement)

---

This lantern has 5 charges. While holding it, you can use an action and expend 1 or more of its charges to cast one of the following spells from it (save DC 14): *burning hands* (1 charge), *fireball* (3 charges), or *cure wounds* (1 charge per spell level, up to 3rd).

The lantern regains 1d4 + 1 expended charges daily at dawn.

---

#### Cloak of the Quiet Moth

Wondrous Item, Uncommon (Requires Attunement)

---

While wearing this cloak, you have resistance to cold and necrotic damage, and you have a flying speed equal to your walking speed. You have darkvision out to a range of 60 feet.

You can use an action to cast the *invisibility* spell from it. This property can't be used again until the next dawn.

In dim light or darkness, you can cast *dancing lights* from the cloak at will.

When you take a reaction, you gain resistance to fire damage until the end of your turn.

---

#### Girdle of the Ox

Wondrous Item, Rare (Requires Attunement)

---

While wearing this girdle, your Constitution score increases by 2, to a maximum of 20. You have advantage on Wisdom (Survival) checks and on rolls for initiative, and you have advantage on saving throws against being frightened.

---

#### Harp of Old Songs

Wondrous Item, Rare (Requires Attunement)

---

You can use an action to play the harp and cast one of its spells: *fly*, *levitate*.

Once you cast a spell from the harp, you can't use it to cast that spell again until the next dawn.
`;

const { pack } = bookPack([{ name: "items-sublist.md", text: ITEMS }], tableRegistry());
const get = (id: string) => pack.definitions.find((d) => d.id === id) as any;

describe("20a: what a book item's text gives, read from it", () => {
  it("charges with their dawn regain; spells by charges, a level's worth, its save DC", () => {
    const l = get("item:lantern-of-little-suns");
    expect(l.charges).toEqual({ max: 5, regain: "1d4+1" });
    const sp = (id: string) => l.grant.spells.find((x: any) => x.spell === id);
    expect(sp("spell:fireball")).toMatchObject({ charges: { cost: 3 }, dc: 14 });
    expect(sp("spell:burning-hands").charges.cost).toBe(1);
    expect(sp("spell:cure-wounds").charges).toEqual({ cost: 1, perLevel: true, maxLevel: 3 });
  });
  it("resistances, speeds and darkvision while worn; a once-a-dawn spell; an at-will one; not what a reaction gives", () => {
    const c = get("item:cloak-of-the-quiet-moth");
    const sels = c.grant.modifiers.map((m: any) => m.selector);
    expect(sels).toEqual(expect.arrayContaining(["defense.resist.cold", "defense.resist.necrotic", "stat.speed.fly", "sense.darkvision"]));
    expect(sels).not.toContain("defense.resist.fire");
    const inv = c.grant.spells.find((x: any) => x.spell === "spell:invisibility");
    expect(inv.resource).toBeTruthy();
    expect(c.grant.resources).toEqual([expect.objectContaining({ id: inv.resource, max: 1, reset: "dawn" })]);
    expect(c.grant.spells.find((x: any) => x.spell === "spell:dancing-lights").atWill).toBe(true);
    // "darkness" is in the sentence, but before "cast": not one of its spells.
    expect(c.grant.spells.some((x: any) => x.spell === "spell:darkness")).toBe(false);
  });
  it("an ability score up to 20; advantage on a skill, on initiative, and on saves against something (a tick-box)", () => {
    const g = get("item:girdle-of-the-ox");
    expect(g.grant.abilityBonuses).toEqual({ con: 2 });
    const adv = g.grant.modifiers.filter((m: any) => m.op === "advantage");
    expect(adv).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: "roll.check.skill.survival" }),
        expect.objectContaining({ selector: "roll.initiative" }),
        expect.objectContaining({ selector: "roll.save.*", mode: "suggested", when: { text: "against being frightened" } }),
      ]),
    );
    expect(adv.find((m: any) => m.selector === "roll.check.skill.survival").mode).toBeUndefined();
  });
  it("each spell once until the next dawn, when the text says so for the item", () => {
    const h = get("item:harp-of-old-songs");
    expect(h.grant.spells.map((x: any) => x.spell)).toEqual(["spell:levitate", "spell:fly"]);
    expect(new Set(h.grant.spells.map((x: any) => x.resource)).size).toBe(2);
  });
});
