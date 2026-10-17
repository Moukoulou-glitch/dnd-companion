import { describe, expect, it } from "vitest";
import { composeD20, composeDamage, type Composed } from "@dnd/dice";
import { rollThrown, type Thrower } from "../src/dice3d.js";
import { CLASS_DICE_COLOURS, DAMAGE_DICE_COLOURS, DEFAULT_DICE_COLOUR, classDiceColour, dieColour, mainClass, myDiceColour, setDiceClasses, setPickedDiceColour } from "../src/diceColours.js";
import { parseFormula } from "@dnd/dice";
import { lookOf, resolveTheme } from "../src/dice/themes.js";

/** A thrower that remembers the sides and colours of each throw. */
const tosser = (...throws: number[][]) => {
  const asked: { sides: number[]; colours?: (string | undefined)[] }[] = [];
  const toss: Thrower = async (sides, colours) => {
    asked.push(colours ? { sides, colours: colours.map((l) => l?.color) } : { sides });
    return throws.shift() ?? sides.map(() => 1);
  };
  return { toss, asked };
};
const WIZARD = CLASS_DICE_COLOURS["class:wizard"]!.colour;
// A die's look as the app makes it (theme resolution), for a wizard who picked no colour.
const colourOf = (label: string | undefined) => lookOf(resolveTheme({ label }, { picked: null, classes: [{ class: "class:wizard", level: 5 }], damageThemes: true, featureThemes: true }), label);
const base = { total: 0, parts: [], dice: [], advantage: [], disadvantage: [], suggestions: [] };

describe("3D dice colours", () => {
  it("your class is the one with the most levels; the first one on a tie", () => {
    expect(mainClass([{ class: "class:fighter", level: 2 }, { class: "class:wizard", level: 5 }])).toBe("class:wizard");
    expect(mainClass([{ class: "class:rogue", level: 3 }, { class: "class:warlock", level: 3 }])).toBe("class:rogue");
    expect(classDiceColour([{ class: "class:rogue", level: 3 }, { class: "class:warlock", level: 3 }])).toBe(CLASS_DICE_COLOURS["class:rogue"]!.colour);
    expect(classDiceColour([])).toBe(DEFAULT_DICE_COLOUR);
    expect(classDiceColour([{ class: "class:homebrew", level: 4 }])).toBe(DEFAULT_DICE_COLOUR);
    // Every class (no Artificer) and every damage type has a colour.
    expect(Object.keys(CLASS_DICE_COLOURS)).toHaveLength(12);
    expect(Object.keys(DAMAGE_DICE_COLOURS)).toEqual(expect.arrayContaining(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"]));
  });

  it("a die takes its damage type's colour, or yours", () => {
    expect(dieColour("fire", WIZARD)).toBe(DAMAGE_DICE_COLOURS.fire);
    expect(dieColour("Cold", WIZARD)).toBe(DAMAGE_DICE_COLOURS.cold);
    expect(dieColour(undefined, WIZARD)).toBe(WIZARD);
    expect(dieColour("Bless", WIZARD)).toBe(WIZARD);
  });

  it("Ice Storm throws its two groups in their two colours", async () => {
    const dmg = composeDamage("2d8", "bludgeoning", { ...base, dice: [{ label: "Ice Storm", dice: "4d6", damageType: "cold" }] });
    const t = tosser();
    await rollThrown(dmg, t.toss, undefined, colourOf);
    expect(t.asked[0]!.sides).toEqual([8, 8, 6, 6, 6, 6]);
    expect(t.asked[0]!.colours).toEqual([...Array(2).fill(DAMAGE_DICE_COLOURS.bludgeoning), ...Array(4).fill(DAMAGE_DICE_COLOURS.cold)]);
  });

  it("an attack with advantage and Bless: both d20s and the d4 in your colour", async () => {
    const d20 = composeD20({ ...base, advantage: ["Reckless Attack"], dice: [{ label: "Bless", dice: "1d4" }] });
    const t = tosser([4, 15, 3]);
    const r = await rollThrown(d20, t.toss, undefined, colourOf);
    expect(t.asked[0]).toEqual({ sides: [20, 20, 4], colours: [WIZARD, WIZARD, WIZARD] });
    expect(r.result.natural).toBe(15);
  });

  it("a reroll (Great Weapon Fighting) is thrown in the colour of the dice it replaces", async () => {
    const c = { terms: parseFormula("2d6r<=2").map((x) => (x.kind === "dice" ? { ...x, label: "slashing" } : x)), sources: [] } as unknown as Composed;
    const t = tosser([1, 5], [4]);
    await rollThrown(c, t.toss, undefined, colourOf);
    expect(t.asked[1]).toEqual({ sides: [6], colours: [DAMAGE_DICE_COLOURS.slashing] });
  });

  it("without colours (as before) the thrower is asked for sides only", async () => {
    const t = tosser([10]);
    await rollThrown({ terms: parseFormula("1d20"), sources: [] } as unknown as Composed, t.toss);
    expect(t.asked[0]).toEqual({ sides: [20] });
  });

  it("a picked colour wins until you switch back to following your class", () => {
    setDiceClasses([{ class: "class:cleric", level: 1 }, { class: "class:druid", level: 4 }]);
    expect(myDiceColour()).toBe(CLASS_DICE_COLOURS["class:druid"]!.colour);
    setPickedDiceColour("#123456");
    expect(myDiceColour()).toBe("#123456");
    setDiceClasses([{ class: "class:wizard", level: 9 }]);
    expect(myDiceColour()).toBe("#123456");
    setPickedDiceColour(null);
    expect(myDiceColour()).toBe(WIZARD);
  });
});
