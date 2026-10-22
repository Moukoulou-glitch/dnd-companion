import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const knight = (extra: Record<string, unknown> = {}) =>
  derive(
    Character.parse({ id: "k", schemaVersion: 1, ruleset: "5e-2014", name: "K", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 }, race: "race:human", classes: [{ class: "class:fighter", level: 3, subclass: "subclass:rune-knight" }], hp: { current: 30, temp: 0 }, ...extra }),
    reg,
  );

describe("10a: tool and instrument checks, the ability picked each time", () => {
  it("Smith's tools (Rune Knight): any ability + proficiency bonus", () => {
    const s = knight();
    const smith = s.tools.find((t) => t.name === "Smith's tools")!;
    expect(smith.proficiency).toBe(1);
    // Str 16 + human 1 = 17 (+3), +2 proficiency.
    expect(smith.checks.str.total).toBe(5);
    expect(smith.checks.cha.total).toBe(-1 + 2);
    expect(smith.checks.int.parts.map((p) => p.label)).toContain("Proficiency bonus");
  });
  it("another tool: no proficiency bonus", () => {
    const s = knight();
    expect(s.anyTool.dex.total).toBe(1);
    expect(s.anyTool.dex.parts.some((p) => /Proficiency/.test(p.label))).toBe(false);
  });
});

describe("10b: Rune Knight runes, always-on and invoked", () => {
  const runes = (level: number, picks: string[], toggles: string[] = []) =>
    derive(
      Character.parse({
        id: "k", schemaVersion: 1, ruleset: "5e-2014", name: "K", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 }, race: "race:human",
        classes: [{ class: "class:fighter", level, subclass: "subclass:rune-knight" }], hp: { current: 30, temp: 0 },
        choices: { "feature:rune-knight-rune-carver": { runes: picks } }, toggles,
        inventory: [{ id: "ls", item: "item:longsword", quantity: 1, equipped: true, attuned: false }],
      }),
      reg,
    );
  it("Fire Rune: tool proficiency doubled, and its invoke offered on weapon damage with the save DC, spending its use", () => {
    const s = runes(3, ["Fire Rune", "Stone Rune"]);
    const smith = s.tools.find((t) => t.name === "Smith's tools")!;
    expect([smith.proficiency, smith.doubledBy, smith.checks.str.total]).toEqual([2, "Fire Rune", 3 + 4]);
    const fire = s.attacks.find((a) => a.name === "Longsword")!.damage.bonus.suggestions.find((x) => x.label === "Fire Rune")!;
    // Con 14 + 1 = 15 (+2): DC 8 + 2 + 2.
    expect(fire).toMatchObject({ apply: { dice: ["2d6"], damageType: "fire" }, spends: { resource: "rune-fire" } });
    expect(fire.reason).toMatch(/Strength save \(DC 12\)/);
    expect(s.resources.find((r) => r.id === "rune-fire")?.max).toBe(1);
  });
  it("Stone Rune: Insight advantage, darkvision 120, its reaction with the DC", () => {
    const s = runes(3, ["Fire Rune", "Stone Rune"]);
    expect(s.skills.insight.advantage).toContain("Stone Rune");
    expect(s.senses.darkvision).toBe(120);
    expect(s.actions.find((a) => a.id === "rune-stone")?.dc?.value).toBe(12);
  });
  it("Frost Rune invoked: +2 Strength and Constitution checks and saves; twice per rest from 15th", () => {
    const s = runes(15, ["Frost Rune", "Cloud Rune"], ["frost-rune"]);
    expect(s.saves.str.parts.some((p) => p.label === "Frost Rune" && p.value === 2)).toBe(true);
    expect(s.skills.deception.advantage).toContain("Cloud Rune");
    expect(s.resources.find((r) => r.id === "rune-frost")?.max).toBe(2);
  });
  it("Hill Rune: poison resistance always, B/P/S while invoked", () => {
    const off = runes(7, ["Hill Rune (7th)"]);
    expect(off.defenses.resist).toContain("poison");
    expect(off.defenses.resist).not.toContain("slashing");
    expect(runes(7, ["Hill Rune (7th)"], ["hill-rune"]).defenses.resist).toContain("slashing");
  });
});
