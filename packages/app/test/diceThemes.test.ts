import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { CLASS_THEMES, DAMAGE_MATERIALS, DAMAGE_THEMES, DEFAULT_THEME, lookOf, registerDiceTheme, resolveTheme, type DicePrefs } from "../src/dice/themes";
import { batches, MAX_IN_AIR } from "../src/dice/plan";

const prefs = (p: Partial<DicePrefs> = {}): DicePrefs => ({ picked: null, classes: [{ class: "class:wizard", level: 5 }], damageThemes: true, featureThemes: true, ...p });

describe("Dice themes: data, resolved in a fixed order", () => {
  it("a theme for every class and the 13 damage types (and healing), each with the colour the dice had before", () => {
    expect(Object.keys(CLASS_THEMES)).toHaveLength(12);
    for (const t of ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder", "healing"]) expect(DAMAGE_THEMES[t]).toBeDefined();
    expect(DEFAULT_THEME.material).toBe("default");
  });

  it("damage dice take their type's theme; your own dice your class's; the first class listed on a tie", () => {
    expect(resolveTheme({ label: "Fire" }, prefs()).id).toBe("damage-fire");
    expect(resolveTheme({ label: "Bless" }, prefs()).id).toBe("class-wizard");
    expect(resolveTheme({}, prefs({ classes: [{ class: "class:rogue", level: 3 }, { class: "class:warlock", level: 3 }] })).id).toBe("class-rogue");
    expect(resolveTheme({}, prefs({ classes: [{ class: "class:rogue", level: 3 }, { class: "class:warlock", level: 4 }] })).id).toBe("class-warlock");
    expect(resolveTheme({}, prefs({ classes: [] }))).toBe(DEFAULT_THEME);
  });

  it("a picked colour wins over the class for your own dice, never over a damage type", () => {
    expect(resolveTheme({ label: "Bless" }, prefs({ picked: "#123456" })).color).toBe("#123456");
    expect(resolveTheme({ label: "cold" }, prefs({ picked: "#123456" })).id).toBe("damage-cold");
    // Damage themes switched off: damage dice look like your own.
    expect(resolveTheme({ label: "cold" }, prefs({ picked: "#123456", damageThemes: false })).color).toBe("#123456");
  });

  it("a feature, spell or homebrew theme is added as data and wins when feature themes are on", () => {
    registerDiceTheme("feature:test-surge", { id: "test-surge", label: "Test surge", material: "default", color: "#aa5500", glow: 1, particles: "sparks" });
    expect(resolveTheme({ label: "fire", source: "feature:test-surge" }, prefs()).id).toBe("test-surge");
    expect(resolveTheme({ label: "fire", source: "feature:test-surge" }, prefs({ featureThemes: false })).id).toBe("damage-fire");
    expect(resolveTheme({ source: "feature:unknown" }, prefs()).id).toBe("class-wizard");
    expect(lookOf(DAMAGE_THEMES.fire!, "fire")).toEqual({ theme: "tc-fire", color: DAMAGE_THEMES.fire!.color, id: "damage-fire", label: "fire", impact: "flare", particles: "embers", glow: 2, haptic: [18] });
  });
});

describe("Large rolls go up in batches", () => {
  const g = (s: string) => s.split("").map((c, i) => ({ g: c, i }));
  it(`at most ${MAX_IN_AIR} dice in the air, in order; a group isn't split when it fits in a throw of its own`, () => {
    expect(batches(g("aaaa"), (x) => x.g)).toEqual([g("aaaa")]);
    const forty = Array.from({ length: 40 }, (_, i) => ({ g: "f", i }));
    const b = batches(forty, (x) => x.g);
    expect(b.map((x) => x.length)).toEqual([12, 12, 12, 4]);
    expect(b.flat().map((x) => x.i)).toEqual(forty.map((x) => x.i));
    // 10 of one type and 4 of another: the 4 start the second throw rather than being split 2 + 2.
    const mixed = [...Array.from({ length: 10 }, (_, i) => ({ g: "a", i })), ...Array.from({ length: 4 }, (_, i) => ({ g: "b", i: 10 + i }))];
    expect(batches(mixed, (x) => x.g).map((x) => x.map((y) => y.g).join(""))).toEqual(["aaaaaaaaaa", "bbbb"]);
  });
});

describe("The 13 damage-type materials", () => {
  const dir = new URL("../public/dice-box/assets/themes/", import.meta.url).pathname;
  it("each type has its own material folder, complete, with the default dice shapes and all dice", () => {
    for (const type of DAMAGE_MATERIALS) {
      const t = DAMAGE_THEMES[type]!;
      expect(t.material).toBe(`tc-${type}`);
      const cfg = JSON.parse(readFileSync(`${dir}${t.material}/theme.config.json`, "utf8"));
      expect(cfg.systemName).toBe(t.material);
      expect(cfg.meshFile).toBeUndefined(); // dice-box then uses the default dice shapes
      expect(cfg.diceAvailable).toEqual(expect.arrayContaining(["d4", "d6", "d8", "d10", "d12", "d20"]));
      for (const f of [cfg.material.diffuseTexture.light, cfg.material.diffuseTexture.dark, cfg.material.bumpTexture, cfg.material.specularTexture]) expect(existsSync(`${dir}${t.material}/${f}`)).toBe(true);
      // Effects named for the strip and screen.
      expect(t.impact).toBeTruthy();
    }
    expect(DAMAGE_THEMES.healing!.material).toBe("default");
  });
});
