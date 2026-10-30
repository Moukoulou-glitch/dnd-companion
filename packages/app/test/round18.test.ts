import { describe, expect, it } from "vitest";
import { spellMatches } from "../src/spellSearch";
import { withDarts, type RollRecord } from "../src/rolls";

const fireball = { name: "Fireball", level: 3, school: "Evocation", ritual: false, concentration: false };
const detect = { name: "Detect Magic", level: 1, school: "Divination", ritual: true, concentration: true };
const bolt = { name: "Fire Bolt", level: 0, school: "Evocation" };

describe("spell search by name, level and school", () => {
  it("finds by name, school, level or both", () => {
    expect(spellMatches("fire", fireball)).toBe(true);
    expect(spellMatches("evocation", fireball)).toBe(true);
    expect(spellMatches("evoc", fireball)).toBe(true);
    expect(spellMatches("3rd", fireball)).toBe(true);
    expect(spellMatches("level 3", fireball)).toBe(true);
    expect(spellMatches("3", fireball)).toBe(true);
    expect(spellMatches("3rd evocation", fireball)).toBe(true);
    expect(spellMatches("1st evocation", fireball)).toBe(false);
    expect(spellMatches("2", fireball)).toBe(false);
    expect(spellMatches("cantrip", bolt)).toBe(true);
    expect(spellMatches("cantrip", fireball)).toBe(false);
    expect(spellMatches("1st ritual", detect)).toBe(true);
    expect(spellMatches("divination concentration", detect)).toBe(true);
    expect(spellMatches("detect mag", detect)).toBe(true);
    expect(spellMatches("necromancy", detect)).toBe(false);
  });
});

describe("Magic Missile: one roll, every dart", () => {
  const rec: RollRecord = {
    id: "x",
    at: 0,
    title: "Magic Missile damage",
    kind: "damage",
    total: 4,
    crit: false,
    fumble: false,
    physical: false,
    lines: [
      { source: "Magic Missile", detail: "1d4 [3]", total: 3 },
      { source: "Magic Missile", detail: "", total: 1 },
    ],
    byType: { force: 4 },
    mainType: "force",
  };
  it("multiplies the roll by the darts, with a line for each dart that adds up", () => {
    const r = withDarts(rec, 3, "darts");
    expect(r.total).toBe(12);
    expect(r.byType).toEqual({ force: 12 });
    expect(r.lines.map((l) => l.source)).toEqual(["Dart 1", "Dart 2", "Dart 3"]);
    expect(r.lines[0]!.detail).toBe("1d4 [3] +1 = 4");
    expect(r.lines.reduce((n, l) => n + l.total, 0)).toBe(12);
    expect(r.darts).toMatchObject({ count: 3, each: 4 });
  });
  it("names an added bonus (Empowered Evocation) in the dart's line", () => {
    const r = withDarts({ ...rec, total: 7, lines: [...rec.lines, { source: "Empowered Evocation", detail: "", total: 3 }] }, 3);
    expect(r.lines[0]!.detail).toBe("1d4 [3] +1 +3 Empowered Evocation = 7");
    expect(r.total).toBe(21);
  });
});
