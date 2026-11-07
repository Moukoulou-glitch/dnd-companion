import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "../src/index.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const holding = (item: string, toggles: string[] = []) => {
  const c = newCharacter({ id: "f", name: "F", race: "race:mountain-dwarf", class: "class:fighter", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
  c.classes = [{ class: "class:fighter", level: 5 }];
  c.inventory.push({ id: "w", item, quantity: 1, equipped: true, attuned: true } as never);
  c.toggles = toggles;
  return derive(c, reg);
};

describe("19j: Whelm", () => {
  it("+3, thrown 20/60, 1d8 more thrown (2d8 against a giant)", () => {
    const s = holding("item:whelm");
    const thrown = s.attacks.find((a) => a.itemInstanceId === "w" && a.mode === "thrown")!;
    expect(thrown.range).toEqual([20, 60]);
    expect(thrown.attack.parts.some((p) => p.label === "Magic weapon" && p.value === 3)).toBe(true);
    expect(thrown.damage.bonus.dice).toEqual(expect.arrayContaining([expect.objectContaining({ dice: "1d8" })]));
    expect(thrown.damage.bonus.suggestions.some((x) => x.label === "Whelm (giant)")).toBe(true);
    const melee = s.attacks.find((a) => a.itemInstanceId === "w" && a.mode === "melee")!;
    expect(melee.damage.bonus.dice.some((d) => d.dice === "1d8")).toBe(false);
  });
  it("Shock Wave and its spell once a dawn; Detect Evil and Good or Locate Object share one use", () => {
    const s = holding("item:whelm");
    expect(s.resources.find((r) => r.id === "whelm-shock-wave")).toMatchObject({ max: 1 });
    expect(s.actions.some((a) => a.id === "whelm-shock-wave")).toBe(true);
    const names = s.spells.filter((x) => ["spell:detect-evil-and-good", "spell:locate-object"].includes(x.id));
    expect(names).toHaveLength(2);
  });
  it("the open sky: disadvantage on attacks, saves and checks while it's switched on", () => {
    const off = holding("item:whelm");
    const on = holding("item:whelm", ["whelm-sky"]);
    expect(off.saves.con.disadvantage).toEqual([]);
    expect(on.saves.con.disadvantage).toContain("Whelm: the open sky");
    expect(on.attacks[0]!.attack.disadvantage).toContain("Whelm: the open sky");
  });
});

describe("19j: Wave", () => {
  it("+3 trident, thrown; any critical hit: half the target's HP maximum as necrotic; advantage on initiative", () => {
    const s = holding("item:wave");
    const atk = s.attacks.find((a) => a.itemInstanceId === "w" && a.mode === "melee")!;
    expect(atk.damage.critRiders).toEqual([expect.objectContaining({ label: "Wave", halfMax: "necrotic", anyCrit: true })]);
    expect(s.initiative.advantage).toContain("Wave (weapon of warning)");
    expect(s.resources.find((r) => r.id === "wave-cube")).toMatchObject({ max: 36 });
    expect(s.spells.some((x) => x.id === "spell:dominate-beast")).toBe(true);
  });
});
