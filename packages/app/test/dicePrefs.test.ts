import { beforeEach, describe, expect, it } from "vitest";
import { damageThemesOn, featureThemesOn, OWN_MATERIALS, ownMaterial, setOwnMaterial, setThemesOn } from "../src/dice/prefs";
import { CLASS_THEMES, DAMAGE_THEMES, DEFAULT_THEME, resolveTheme, type DicePrefs } from "../src/dice/themes";
import { registerFeatureThemes } from "../src/dice/featureThemes";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
if (!(globalThis as any).window) (globalThis as any).window = new EventTarget();

const prefs = (p: Partial<DicePrefs> = {}): DicePrefs => ({ picked: null, classes: [{ class: "class:wizard", level: 5 }], damageThemes: true, featureThemes: true, ...p });

describe("dice prefs (7d)", () => {
  beforeEach(() => store.clear());
  it("defaults: classic material, both looks on", () => {
    expect(ownMaterial()).toBe("default");
    expect(damageThemesOn()).toBe(true);
    expect(featureThemesOn()).toBe(true);
  });
  it("stores choices; an unknown material falls back to classic", () => {
    setOwnMaterial("tc-cold");
    expect(ownMaterial()).toBe("tc-cold");
    expect(store.get("dnd-dice-material")).toBe("tc-cold");
    setOwnMaterial("default");
    expect(store.has("dnd-dice-material")).toBe(false);
    setThemesOn("damage", false);
    expect(damageThemesOn()).toBe(false);
    expect(store.get("dnd-dice-damage-themes")).toBe("0");
    setThemesOn("damage", true);
    expect(damageThemesOn()).toBe(true);
    expect(OWN_MATERIALS.every((m) => m.id === "default" || m.id.startsWith("tc-"))).toBe(true);
  });
});

describe("resolveTheme with the 7d choices", () => {
  registerFeatureThemes();
  it("own material on class dice keeps the class colour", () => {
    const t = resolveTheme({}, prefs({ ownMaterial: "tc-cold" }));
    expect(t.color).toBe(CLASS_THEMES["class:wizard"]!.color);
    expect(t.material).toBe("tc-cold");
  });
  it("own material on a picked colour", () => {
    const t = resolveTheme({}, prefs({ picked: "#123456", ownMaterial: "tc-fire" }));
    expect(t).toMatchObject({ color: "#123456", material: "tc-fire" });
  });
  it("classic material leaves the class theme as it is", () => {
    expect(resolveTheme({}, prefs({ ownMaterial: "default" }))).toBe(CLASS_THEMES["class:wizard"]);
  });
  it("damage looks off: fire dice look like yours", () => {
    expect(resolveTheme({ label: "fire" }, prefs())).toBe(DAMAGE_THEMES.fire);
    const t = resolveTheme({ label: "fire" }, prefs({ damageThemes: false, ownMaterial: "tc-force" }));
    expect(t).toMatchObject({ color: CLASS_THEMES["class:wizard"]!.color, material: "tc-force" });
  });
  it("feature looks off: Sneak Attack dice are yours (or their damage type's)", () => {
    expect(resolveTheme({ label: "piercing", keys: ["name:Sneak Attack"] }, prefs()).id).toBe("feature-shadow");
    expect(resolveTheme({ label: "piercing", keys: ["name:Sneak Attack"] }, prefs({ featureThemes: false }))).toBe(DAMAGE_THEMES.piercing);
    expect(resolveTheme({}, prefs({ featureThemes: false, raging: true }))).toBe(CLASS_THEMES["class:wizard"]);
  });
  it("no class: the classic theme", () => {
    expect(resolveTheme({}, prefs({ classes: [] }))).toBe(DEFAULT_THEME);
  });
});
