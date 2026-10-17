import { describe, expect, it } from "vitest";
import { ActionDef, ResourceDef } from "@dnd/schema";
import { parseFormula, type Composed } from "@dnd/dice";
import { FEATURE_PRESETS, registerContentThemes, registerFeatureThemes, themeFromSpec } from "../src/dice/featureThemes";
import { resolveTheme, type DicePrefs } from "../src/dice/themes";
import { rollThrown, type Thrower } from "../src/dice3d";
import { rollFx } from "../src/fx/triggers";
import { phaseLook } from "../src/fx/spells";
import type { RollRecord } from "../src/rolls";

registerFeatureThemes();
const prefs = (p: Partial<DicePrefs> = {}): DicePrefs => ({ picked: null, classes: [{ class: "class:rogue", level: 5 }], damageThemes: true, featureThemes: true, ...p });
const theme = (label: string | undefined, keys: string[], p?: Partial<DicePrefs>) => resolveTheme({ label, keys }, prefs(p)).id;

describe("Feature themes: presets matched by name or by the resource spent", () => {
  it("Sneak Attack's dice are shadow, not their damage type; Second Wind's are revitalising; death saves restrained", () => {
    expect(theme("piercing", ["name:Sneak Attack"])).toBe("feature-shadow");
    expect(theme("piercing", ["name:Rapier"])).toBe("damage-piercing");
    expect(theme("healing", ["name:Second Wind"])).toBe("feature-vital");
    expect(theme(undefined, ["name:Death saving throw"])).toBe("feature-death");
    expect(FEATURE_PRESETS.death!.particles).toBeUndefined();
  });

  it("every maneuver spends a superiority die: martial, by the resource (any of the three pools); Psionic Energy by its prefix", () => {
    expect(theme("slashing", ["resource:superiority-dice", "name:Trip Attack"])).toBe("feature-martial");
    expect(theme("slashing", ["resource:superiority-dice-technique"])).toBe("feature-martial");
    expect(theme("slashing", ["resource:martial-adept-superiority"])).toBe("feature-martial");
    expect(theme("psychic", ["resource:psionic-energy-dice"])).toBe("feature-psionic");
  });

  it("Way of Mercy: healing and harm look different; divine features share divine light", () => {
    expect(theme("healing", ["name:Hand of Healing"])).not.toBe(theme("necrotic", ["name:Hand of Harm"]));
    expect(theme("radiant", ["name:Divine Smite"])).toBe("feature-divine");
    expect(theme("radiant", ["name:Channel Divinity: Turn Undead"])).toBe("feature-divine");
  });

  it("raging: your own dice take Rage's theme; damage dice keep their type; feature themes off: none of this", () => {
    expect(theme(undefined, [], { raging: true })).toBe("feature-rage");
    expect(theme("slashing", [], { raging: true })).toBe("damage-slashing");
    expect(theme(undefined, ["name:Sneak Attack"], { featureThemes: false })).toBe("class-rogue");
    expect(theme(undefined, [], { raging: true, featureThemes: false })).toBe("class-rogue");
  });

  it("content can name a preset or describe its own look (homebrew), checked by the schema", () => {
    expect(ActionDef.parse({ id: "x", name: "Ember Fist", economy: "action", diceTheme: "divine" }).diceTheme).toBe("divine");
    expect(ResourceDef.parse({ id: "y", name: "Star Dice", max: 3, reset: "long", diceTheme: { preset: "psionic", color: "#123456" } }).diceTheme).toEqual({ preset: "psionic", color: "#123456" });
    expect(() => ResourceDef.parse({ id: "y", name: "Star Dice", max: 3, reset: "long", diceTheme: { color: "red" } })).toThrow();
    expect(themeFromSpec({ preset: "psionic", color: "#123456" }, "y", "Star Dice")).toMatchObject({ material: "tc-psychic", color: "#123456", id: "content-y" });
    const fakeReg = {
      list: (kind: string) =>
        kind === "feature"
          ? [{ id: "feature:hb", grant: { actions: [{ id: "ember-fist", name: "Ember Fist", diceTheme: "divine" }], resources: [{ id: "star-dice", name: "Star Dice", diceTheme: { preset: "psionic", color: "#123456" } }] } }]
          : [],
    };
    expect(registerContentThemes(fakeReg as never)).toBe(2);
    expect(theme("fire", ["name:Ember Fist"])).toBe("feature-divine");
    expect(theme("fire", ["resource:star-dice"])).toBe("content-star-dice");
  });

  it("each die's source in the roll reaches its look (Sneak Attack's dice beside the weapon's)", async () => {
    const c = { terms: parseFormula("1d8+3d6").map((t) => (t.kind === "dice" ? { ...t, label: "piercing" } : t)), sources: ["Rapier", "Sneak Attack"] } as unknown as Composed;
    const seen: (string | undefined)[] = [];
    const toss: Thrower = async (sides) => sides.map(() => 1);
    await rollThrown(c, toss, undefined, (_label, _sides, source) => (seen.push(source), undefined));
    expect(seen).toEqual(["Rapier", "Sneak Attack", "Sneak Attack", "Sneak Attack"]);
  });
});

describe("Spell accents reuse the effect system", () => {
  const dmg = (r: Partial<RollRecord>): RollRecord => ({ id: "r", at: 0, title: "", kind: "damage", total: 0, crit: false, fumble: false, physical: false, lines: [], ...r });
  it("Fireball bursts, Lightning Bolt arcs across, Tidal Wave washes; other spells keep their damage type's look", () => {
    expect(phaseLook("spell:fireball", "resolve")).toMatchObject({ look: "sfx-fireball", at: "tap" });
    expect(phaseLook("spell:lightning-bolt", "resolve")).toMatchObject({ look: "sfx-lbolt", at: "across" });
    expect(phaseLook("spell:tidal-wave", "resolve")?.look).toContain("sfx-water");
    expect(rollFx(dmg({ spell: "spell:fireball", byType: { fire: 28 } }))).toEqual([{ kind: "spell", spell: "spell:fireball", phase: "resolve" }]);
    expect(rollFx(dmg({ spell: "spell:blight", byType: { necrotic: 30 } }))).toEqual([{ kind: "damage-type", type: "necrotic" }]);
  });
});
