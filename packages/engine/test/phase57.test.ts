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
