import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_830_000_000_000;
const who = (race: string, cls = "class:fighter", level = 1, subclass?: string, goggles?: boolean) => {
  const c = newCharacter({ id: "x", name: "X", race, class: cls, abilities: { str: 12, dex: 14, con: 14, int: 10, wis: 14, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, ...(subclass ? { subclass } : {}) };
  if (goggles !== undefined) c.inventory.push({ id: "g", item: "item:goggles-of-night", quantity: 1, equipped: goggles, attuned: false } as never);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const dv = (l: CharacterLog) => derive(l.character, reg).senses.darkvision;
const from = (l: CharacterLog) => derive(l.character, reg).senseSources.darkvision?.map((x) => `${x.label} ${x.value}`);

describe("Darkvision from items and effects", () => {
  it("Goggles of Night: 60 ft, or +60 ft when you already have darkvision; only while worn", () => {
    expect(dv(who("race:human", "class:fighter", 1, undefined, true))).toBe(60);
    const dwarf = who("race:hill-dwarf", "class:fighter", 1, undefined, true);
    expect(dv(dwarf)).toBe(120);
    expect(from(dwarf)).toEqual(["Goggles of Night (+60) 120", "Darkvision 60"]);
    expect(dv(who("race:hill-dwarf", "class:fighter", 1, undefined, false))).toBe(60);
    expect(dv(who("race:human", "class:fighter", 1, undefined, false))).toBeUndefined();
  });

  it("a shared Eyes of Night gives 300 ft for its hour, then your own sense is back as it was", () => {
    const l = who("race:hill-dwarf");
    l.record("addEffect", { instanceId: "eon", effect: "other:eyes-of-night" });
    expect(dv(l)).toBe(300);
    expect(from(l)![0]).toBe("Eyes of Night (shared) 300");
    l.record("passTime", { minutes: 60 });
    expect(dv(l)).toBe(60);
    const h = who("race:human");
    h.record("addEffect", { instanceId: "eon", effect: "other:eyes-of-night" });
    expect(dv(h)).toBe(300);
  });

  it("the Twilight cleric's own 300 ft, and Goggles on top of it", () => {
    expect(dv(who("race:human", "class:cleric", 1, "subclass:twilight-domain"))).toBe(300);
    expect(dv(who("race:human", "class:cleric", 1, "subclass:twilight-domain", true))).toBe(360);
  });

  it("Umbral Sight: 60 ft, or +30 ft with darkvision already", () => {
    expect(dv(who("race:human", "class:ranger", 3, "subclass:gloom-stalker"))).toBe(60);
    expect(dv(who("race:hill-dwarf", "class:ranger", 3, "subclass:gloom-stalker"))).toBe(90);
  });

  it("two things that extend don't extend each other; the best counts", () => {
    // A human with Goggles and Umbral Sight: neither had darkvision from elsewhere, so 60 (not 120).
    const l = who("race:human", "class:ranger", 3, "subclass:gloom-stalker", true);
    expect(dv(l)).toBe(60);
    expect(from(l)).toHaveLength(2);
    // A dwarf with both: the best extension, +60.
    expect(dv(who("race:hill-dwarf", "class:ranger", 3, "subclass:gloom-stalker", true))).toBe(120);
  });

  it("the Darkvision spell: 60 ft for 8 hours; it doesn't add to a race's 60", () => {
    const l = who("race:human");
    l.record("addEffect", { instanceId: "dv", effect: "effect:darkvision" });
    expect(dv(l)).toBe(60);
    l.record("passTime", { minutes: 480 });
    expect(dv(l)).toBeUndefined();
    const d = who("race:hill-dwarf");
    d.record("addEffect", { instanceId: "dv", effect: "effect:darkvision" });
    expect(dv(d)).toBe(60);
  });

  it("other senses are unchanged (Blind Fighting's blindsight)", () => {
    const l = who("race:human");
    expect(derive(l.character, reg).senses.blindsight).toBeUndefined();
  });
});
