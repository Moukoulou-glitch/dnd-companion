import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../../store/src/log.js";
import { HybridClock } from "../../store/src/clock.js";
import { opFx, rollFx } from "../src/fx/triggers.js";
import { CAST_MS, IMPACT_MS, SKIP_AFTER, genLook, shapeOf, shakeOf, spellInfoOf, tierOf, type SpellInfo } from "../src/fx/generated.js";
import { SPELL_FX } from "../src/fx/spells.js";
import { specOf } from "../src/fx/FxLayer.js";
import type { RollRecord } from "../src/rolls.js";

// Invented spells: only the fields a look needs.
const sp = (x: Partial<SpellInfo>): SpellInfo => ({ id: "spell:test", name: "Test Spell", level: 1, school: "Evocation", range: "60 feet", ...x });
const reg = tableRegistry();
const info = (id: string) => spellInfoOf(reg.find(id, "spell"));
const dmg = (r: Partial<RollRecord>): RollRecord => ({ id: "r", at: 0, title: "", kind: "damage", total: 0, crit: false, fumble: false, physical: false, lines: [], ...r });
let t = 1_804_000_000_000;
const wizard = () => {
  const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 17 };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("generated spell effects: tiers by level", () => {
  it("cantrip, 1st–2nd, 3rd–5th, 6th–8th, 9th", () => {
    expect([0, 1, 2, 3, 5, 6, 8, 9].map(tierOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    // Longer and bigger with each tier; never more than 3 seconds.
    const casts = [0, 1, 2, 3, 4].map((k) => CAST_MS[k as 0]);
    expect([...casts].sort((a, b) => a - b)).toEqual(casts);
    expect(Math.max(...casts)).toBeLessThanOrEqual(3000);
    expect(Math.max(...Object.values(IMPACT_MS))).toBeLessThanOrEqual(1500);
    const big = genLook(sp({ level: 9 }), "cast");
    const small = genLook(sp({ level: 0 }), "cast");
    expect(big.particles).toBeGreaterThan(small.particles);
    expect(big.rings).toBeGreaterThan(small.rings);
    expect(big.buzz.length).toBeGreaterThan(small.buzz.length);
  });
  it("only what lasts longer than 1.5 s can be tapped away: from 6th level", () => {
    for (let lv = 0; lv <= 9; lv++) expect(genLook(sp({ level: lv }), "cast").skippable).toBe(CAST_MS[tierOf(lv)] > SKIP_AFTER);
    expect(genLook(sp({ level: 5 }), "cast").skippable).toBe(false);
    expect(genLook(sp({ level: 6 }), "cast").skippable).toBe(true);
    expect(genLook(sp({ level: 9 }), "resolve").skippable).toBe(false);
  });
  it("shakes from 7th level only, more at 9th, less on its impact", () => {
    expect([0, 3, 6].map((l) => shakeOf(l, "cast"))).toEqual([0, 0, 0]);
    expect(shakeOf(7, "cast")).toBeGreaterThan(0);
    expect(shakeOf(9, "cast")).toBeGreaterThan(shakeOf(8, "cast"));
    expect(shakeOf(9, "resolve")).toBeLessThan(shakeOf(9, "cast"));
    expect(specOf({ kind: "gen", g: genLook(sp({ level: 6 }), "cast") }).shake).toBeUndefined();
    expect(specOf({ kind: "gen", g: genLook(sp({ level: 9 }), "cast") }).shake).toBe(650);
  });
  it("a higher slot adds rings and sparks and says the level, never a higher tier", () => {
    const base = genLook(sp({ level: 1 }), "cast", { slot: 1 });
    const up = genLook(sp({ level: 1 }), "cast", { slot: 5 });
    expect(up.tier).toBe(base.tier);
    expect(up.up).toBe(3);
    expect(up.rings).toBe(base.rings + 3);
    expect(up.particles).toBeGreaterThan(base.particles);
    expect(up.label).toBe("Test Spell · 5th level");
    expect(base.label).toBe("Test Spell");
    // Cantrips: no name label.
    expect(genLook(sp({ level: 0 }), "cast").label).toBeUndefined();
  });
  it("the biggest take the middle of the screen; a spell on yourself plays on your hit points", () => {
    expect(genLook(sp({ level: 7 }), "cast").at).toBe("center");
    expect(genLook(sp({ level: 2, range: "Self" }), "cast").at).toBe("hp");
    expect(genLook(sp({ level: 2 }), "cast").at).toBe("tap");
  });
});

describe("generated spell effects: shape and colour", () => {
  it("the shape comes from the area, then range, then the school's motif", () => {
    expect(shapeOf(sp({ area: "15-foot cone" }))).toBe("cone");
    expect(shapeOf(sp({ area: "60-foot line" }))).toBe("line");
    expect(shapeOf(sp({ area: "20-foot cube" }))).toBe("cube");
    expect(shapeOf(sp({ area: "40-foot cylinder" }))).toBe("cylinder");
    expect(shapeOf(sp({ area: "20-foot sphere", damage: { type: "fire" } }))).toBe("sphere");
    // No area field: the first "N-foot shape" in the text (invented text).
    expect(shapeOf(sp({ text: ["A ripple fills a 10-foot-radius circle around a point you choose."] }))).toBe("sphere");
    expect(shapeOf(sp({ text: ["Glitter sprays out in a 15-foot cone."] }))).toBe("cone");
    expect(shapeOf(sp({ name: "Wall of Glass" }))).toBe("wall");
    expect(shapeOf(sp({ range: "Touch" }))).toBe("touch");
    expect(shapeOf(sp({ damage: { type: "cold" }, attack: "ranged" }))).toBe("ray");
    expect(shapeOf(sp({ range: "Self" }))).toBe("aura");
    expect(shapeOf(sp({ range: "Self", area: "10-foot sphere" }))).toBe("aura");
    expect(shapeOf(sp({ heal: { atSlot: { "1": "1d8" } }, range: "Touch" }))).toBe("heal");
    expect(shapeOf(sp({ range: "120 feet" }))).toBe("motif");
  });
  it("its damage type's colour, the school's second colour; healing in emerald and gold", () => {
    const g = genLook(sp({ damage: { type: "cold" } }), "cast");
    expect(g.rgb).toBe("170, 220, 255");
    expect(g.rgb2).toBe("255, 230, 140");
    expect(g.damage).toBe("Cold");
    expect(genLook(sp({ school: "Necromancy" }), "cast").rgb).toBe("140, 230, 150");
    expect(genLook(sp({ heal: {} }), "cast").rgb).toBe("110, 230, 160");
    // A school a book file names differently: the plain arcane colours, never an error.
    expect(genLook(sp({ school: "Chronurgy" }), "cast").school).toBe("arcane");
    // The type actually rolled colours the impact (a spell that lets you pick).
    const pick = genLook(sp({ damage: { typeOptions: ["Acid", "Fire"] } }), "resolve", { type: "fire" });
    expect(pick.rgb).toBe("255, 130, 50");
    expect(pick.label).toBe("Fire");
  });
  it("every SRD spell gets one, within its tier's time, and not all look alike", () => {
    const spells = reg.list("spell").map(spellInfoOf).filter((x): x is SpellInfo => !!x);
    expect(spells.length).toBeGreaterThan(300);
    const shapes = new Set<string>();
    for (const s of spells) {
      const g = genLook(s, "cast");
      shapes.add(g.shape);
      expect(g.ms).toBe(CAST_MS[tierOf(s.level)]);
      expect(g.ms).toBeLessThanOrEqual(3000);
    }
    expect(shapes.size).toBeGreaterThanOrEqual(10);
    expect(shapeOf(info("spell:fireball")!)).toBe("sphere");
    expect(shapeOf(info("spell:cone-of-cold")!)).toBe("cone");
    expect(shapeOf(info("spell:cure-wounds")!)).toBe("heal");
    expect(shapeOf(info("spell:lightning-bolt")!)).toBe("line");
  });
});

describe("generated spell effects: when they play", () => {
  it("casting a spell with no look of its own plays its generated cast, with the slot it used", () => {
    const l = wizard();
    const before = l.character;
    const p = { spell: "spell:cone-of-cold", list: "wizard", level: 7, using: "slot" };
    l.record("castSpell", p);
    const ev = opFx("castSpell", p, before, l.character, () => "Evocation", info);
    expect(ev).toHaveLength(1);
    const g = (ev[0] as { kind: "gen"; g: ReturnType<typeof genLook> }).g;
    expect(ev[0]!.kind).toBe("gen");
    expect([g.shape, g.tier, g.up, g.label]).toEqual(["cone", 2, 2, "Cone of Cold · 7th level"]);
    // No lookup given: the older circle in the school's colour, as before.
    expect(opFx("castSpell", p, before, l.character, () => "Evocation")).toEqual([{ kind: "cast", school: "evocation" }]);
  });
  it("a hand-made look stays; a hand-made spell without a cast look gets the generated cast", () => {
    const l = wizard();
    const before = l.character;
    const call = { spell: "spell:call-lightning", list: "druid", level: 3, using: "slot" };
    expect(opFx("castSpell", call, before, before, () => "Conjuration", info)).toEqual([{ kind: "spell", spell: "spell:call-lightning", phase: "cast" }]);
    expect(SPELL_FX["spell:fireball"]?.cast).toBeUndefined();
    const fb = opFx("castSpell", { spell: "spell:fireball", list: "wizard", level: 3, using: "slot" }, before, before, () => "Evocation", info);
    expect(fb[0]!.kind).toBe("gen");
    // Its damage keeps its own burst.
    expect(rollFx(dmg({ spell: "spell:fireball", byType: { Fire: 30 } }), undefined, info)).toEqual([{ kind: "spell", spell: "spell:fireball", phase: "resolve" }]);
  });
  it("its damage plays the generated impact in the rolled type's colour, instead of the plain damage look", () => {
    const ev = rollFx(dmg({ spell: "spell:cone-of-cold", byType: { Cold: 40 } }), undefined, info);
    expect(ev).toHaveLength(1);
    const g = (ev[0] as { kind: "gen"; g: ReturnType<typeof genLook> }).g;
    expect([g.phase, g.shape, g.rgb, g.label]).toEqual(["resolve", "cone", "170, 220, 255", "Cold"]);
    // A later use from the concentration chip.
    const again = rollFx(dmg({ spell: "spell:cone-of-cold", again: true, byType: { Cold: 10 } }), undefined, info);
    expect((again[0] as { g: { phase: string } }).g.phase).toBe("again");
    // No lookup: the damage type's look, as before.
    expect(rollFx(dmg({ spell: "spell:cone-of-cold", byType: { Cold: 40 } }))).toEqual([{ kind: "damage-type", type: "cold" }]);
    // Not a spell: unchanged.
    expect(rollFx(dmg({ byType: { Slashing: 8 } }), undefined, info)).toEqual([{ kind: "damage-type", type: "slashing" }]);
  });
});
