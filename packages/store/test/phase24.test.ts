import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();

describe("Small fixes", () => {
  it("Otherworldly Glamour adds Wisdom to Charisma checks, at least +1", () => {
    const c = newCharacter({ id: "r", name: "R", race: "race:human", class: "class:ranger", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 7, cha: 12 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 3, subclass: "subclass:fey-wanderer" };
    const s = derive(c, reg);
    // Wisdom 7 is −2: the glamour still adds +1.
    expect(s.skills.persuasion.parts.find((p) => p.label.startsWith("Otherworldly Glamour"))?.value).toBe(1);
  });
});


let t = 1_795_000_000_000;
const druid = () => {
  const c = newCharacter({ id: "y", name: "Yoyo", race: "race:human", class: "class:druid", abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 8 };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("Extra spells without a slot, spell scrolls", () => {
  it("an extra spell casts without a slot and counts since each rest", () => {
    const l = druid();
    l.record("addExtra", { id: "x1", kind: "spell", value: "spell:control-weather", list: "druid", tag: "DM allows", reason: "dm" } as never);
    const sp = () => derive(l.character, reg).spells.find((s) => s.id === "spell:control-weather")!;
    expect(sp().cast.slotLevels).toEqual([]);
    expect(sp().cast.extra).toEqual({ tag: "DM allows", sinceShort: 0, sinceLong: 0 });
    l.record("castSpell", { spell: "spell:control-weather", list: "druid", level: 8, using: "extra" });
    l.record("castSpell", { spell: "spell:control-weather", list: "druid", level: 8, using: "extra" });
    expect(sp().cast.extra).toMatchObject({ sinceShort: 2, sinceLong: 2 });
    expect(l.character.slotsUsed["8"] ?? 0).toBe(0);
    l.record("rest", { kind: "short" });
    expect(sp().cast.extra).toMatchObject({ sinceShort: 0, sinceLong: 2 });
    l.record("rest", { kind: "long" });
    expect(sp().cast.extra).toMatchObject({ sinceShort: 0, sinceLong: 0 });
  });

  it("a spell scroll: its spell, the scroll's DC and attack, a check above your level, used up when read", () => {
    const l = druid();
    l.record("addItem", { instanceId: "s1", item: "item:spell-scroll-3rd-level", quantity: 2 });
    l.record("setItem", { instanceId: "s1", scroll: { spell: "spell:call-lightning" } });
    let sp = derive(l.character, reg).spells.find((s) => s.list.id === "scroll-s1")!;
    expect(sp.cast.scroll).toMatchObject({ level: 3, dc: 15, attack: 7, onList: true });
    expect(sp.cast.scroll!.check).toBeUndefined();
    expect(sp.save?.dc).toBe(15);
    l.record("castSpell", { spell: "spell:call-lightning", list: "scroll-s1", level: 3, using: "scroll" });
    expect(l.character.inventory.find((i) => i.id === "s1")?.quantity).toBe(1);
    expect(l.character.concentration?.spell).toBe("spell:call-lightning");
    // A 9th-level scroll for an 8th-level druid: a Wisdom check, DC 19. Failed: gone, no spell.
    l.record("addItem", { instanceId: "s9", item: "item:spell-scroll-9th-level", quantity: 1 });
    l.record("setItem", { instanceId: "s9", scroll: { spell: "spell:storm-of-vengeance" } });
    sp = derive(l.character, reg).spells.find((s) => s.list.id === "scroll-s9")!;
    expect(sp.cast.scroll).toMatchObject({ level: 9, dc: 19, attack: 11, check: { dc: 19, ability: "wis", bonus: 3 } });
    l.record("castSpell", { spell: "spell:storm-of-vengeance", list: "scroll-s9", level: 9, using: "scroll", failed: true });
    expect(l.character.inventory.some((i) => i.id === "s9")).toBe(false);
    expect(l.character.concentration?.spell).toBe("spell:call-lightning");
    // A wizard spell isn't on the druid list: warned, not blocked.
    l.record("addItem", { instanceId: "s1b", item: "item:spell-scroll-1st-level", quantity: 1 });
    l.record("setItem", { instanceId: "s1b", scroll: { spell: "spell:magic-missile" } });
    expect(derive(l.character, reg).spells.find((s) => s.list.id === "scroll-s1b")?.cast.scroll?.onList).toBe(false);
  });
});

describe("Tasha's optional class features, per character", () => {
  it("are on by default, can be turned off and back on", () => {
    const c = newCharacter({ id: "m", name: "M", race: "race:human", class: "class:monk", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 10 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 5 };
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    const s0 = derive(l.character, reg);
    expect(s0.features.some((f) => f.id === "feature:monk-ki-fueled-attack")).toBe(true);
    expect(s0.optionalFeatures.find((f) => f.id === "feature:monk-ki-fueled-attack")).toMatchObject({ on: true, className: "Monk", level: 3 });
    // A feature that isn't optional isn't listed.
    expect(s0.optionalFeatures.some((f) => f.id === "feature:extra-attack")).toBe(false);
    l.record("setOptionalFeature", { feature: "feature:monk-ki-fueled-attack", on: false });
    const s1 = derive(l.character, reg);
    expect(s1.features.some((f) => f.id === "feature:monk-ki-fueled-attack")).toBe(false);
    expect(s1.optionalFeatures.find((f) => f.id === "feature:monk-ki-fueled-attack")?.on).toBe(false);
    l.record("setOptionalFeature", { feature: "feature:monk-ki-fueled-attack", on: true });
    expect(derive(l.character, reg).features.some((f) => f.id === "feature:monk-ki-fueled-attack")).toBe(true);
  });
});

describe("Proficiencies taken away by the table", () => {
  it("removes a save, an armor and a skill (with its expertise) whatever gives them, and gives them back", () => {
    const c = newCharacter({ id: "f", name: "F", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("addExtra", { id: "e1", kind: "skill", value: "athletics", tag: "DM allows", reason: "x" } as never);
    l.record("addExtra", { id: "e2", kind: "expertise", value: "athletics", tag: "DM allows", reason: "x" } as never);
    const before = derive(l.character, reg);
    expect(before.saves.str.proficient).toBeTruthy();
    expect(before.proficiencies.armor).toContain("heavy");
    expect(before.skills.athletics.proficiency).toBe(2);
    l.record("setProfRemoved", { kind: "save", target: "str", removed: true, reason: "curse" });
    l.record("setProfRemoved", { kind: "armor", target: "heavy", removed: true });
    l.record("setProfRemoved", { kind: "skill", target: "athletics", removed: true });
    const after = derive(l.character, reg);
    expect(after.saves.str.proficient).toBeFalsy();
    expect(after.proficiencies.armor).not.toContain("heavy");
    expect(after.skills.athletics.proficiency).toBe(0);
    expect(after.proficiencies.removed).toContainEqual({ kind: "save", target: "str", reason: "curse" });
    l.record("setProfRemoved", { kind: "save", target: "str", removed: false });
    expect(derive(l.character, reg).saves.str.proficient).toBeTruthy();
  });
});
