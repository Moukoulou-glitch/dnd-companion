import { describe, expect, it } from "vitest";
import { type Character, type CustomCompanion } from "@dnd/schema";
import { choiceOptions, customCompanionId, derive, levelGains, newCharacter } from "@dnd/engine";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_802_000_000_000;
const ranger = (level: number, subclass?: string) => {
  const c = newCharacter({ id: "r", name: "R", race: "race:human", class: "class:ranger", abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 14, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, ...(subclass ? { subclass } : {}) };
  return c;
};
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
const ids = (c: Character) => derive(c, reg).features.map((f) => f.id);
const TASHA_RANGER = reg.get("class:ranger", "class").features.filter((f) => f.optional).map((f) => f.feature);

describe("Ranger: Tasha's features stand in for the PHB ones", () => {
  it("on by default (existing rangers keep Favored Foe and Deft Explorer); off brings the PHB features back", () => {
    const c = ranger(14);
    const on = ids(c);
    expect(on).toEqual(expect.arrayContaining(["feature:favored-foe", "feature:deft-explorer", "feature:primal-awareness", "feature:deft-explorer-roving", "feature:deft-explorer-tireless", "feature:natures-veil"]));
    for (const phb of ["feature:favored-enemy-1-type", "feature:favored-enemy-2-types", "feature:favored-enemy-3-enemies", "feature:natural-explorer-1-terrain-type", "feature:natural-explorer-2-terrain-types", "feature:natural-explorer-3-terrain-types", "feature:primeval-awareness", "feature:hide-in-plain-sight"])
      expect(on).not.toContain(phb);
    // Features no Tasha's option touches are there either way.
    expect(on).toEqual(expect.arrayContaining(["feature:ranger-extra-attack", "feature:ranger-lands-stride", "feature:vanish"]));

    const l = logOf(c);
    l.record("setOptionalFeature", { feature: TASHA_RANGER[0], on: false, also: TASHA_RANGER.slice(1) });
    expect(l.character.optionalOff?.sort()).toEqual([...TASHA_RANGER].sort());
    const off = ids(l.character);
    expect(off).toEqual(expect.arrayContaining(["feature:favored-enemy-1-type", "feature:favored-enemy-2-types", "feature:favored-enemy-3-enemies", "feature:natural-explorer-3-terrain-types", "feature:primeval-awareness", "feature:hide-in-plain-sight"]));
    expect(off).not.toContain("feature:favored-foe");
    expect(off).not.toContain("feature:natures-veil");
    const sheet = derive(l.character, reg);
    expect(sheet.optionalClasses).toEqual([{ className: "Ranger", ids: TASHA_RANGER, on: false, some: false }]);
    // And back on, all at once.
    l.record("setOptionalFeature", { feature: TASHA_RANGER[0], on: true, also: TASHA_RANGER.slice(1) });
    expect(l.character.optionalOff ?? []).toEqual([]);
    expect(derive(l.character, reg).optionalClasses[0]).toMatchObject({ on: true, some: false });
  });

  it("one switched off: only its PHB feature comes back, and the sheet says what each stands in for", () => {
    const c = ranger(10);
    c.optionalOff = ["feature:natures-veil"];
    const f = ids(c);
    expect(f).toContain("feature:hide-in-plain-sight");
    expect(f).toContain("feature:deft-explorer-tireless");
    expect(f).not.toContain("feature:natural-explorer-3-terrain-types");
    const sheet = derive(c, reg);
    expect(sheet.optionalClasses[0]).toMatchObject({ on: false, some: true });
    expect(sheet.optionalFeatures.find((x) => x.id === "feature:natures-veil")).toMatchObject({ on: false, instead: ["Hide in Plain Sight"] });
    expect(sheet.optionalFeatures.find((x) => x.id === "feature:favored-foe")!.instead!.length).toBeGreaterThan(0);
  });

  it("level-ups show the Tasha's feature, or the PHB one when it's off", () => {
    const c = ranger(5);
    expect(levelGains(c, reg, "class:ranger")!.features.map((f) => f.id)).toEqual(["feature:deft-explorer-roving"]);
    c.optionalOff = ["feature:deft-explorer-roving"];
    expect(levelGains(c, reg, "class:ranger")!.features.map((f) => f.id)).toEqual(expect.arrayContaining(["feature:natural-explorer-2-terrain-types"]));
    expect(levelGains(c, reg, "class:ranger")!.features.map((f) => f.id)).not.toContain("feature:deft-explorer-roving");
  });

  it("2nd level: Fighting Style and Spellcasting (slots)", () => {
    const c = ranger(2);
    const s = derive(c, reg);
    expect(s.features.map((f) => f.id)).toEqual(expect.arrayContaining(["feature:fighting-style-ranger", "feature:spellcasting-ranger"]));
    expect(s.spellcasting.some((x) => x.id === "ranger")).toBe(true);
    expect(s.spellSlots[0]!.total).toBe(2);
    expect(derive(ranger(1), reg).spellSlots.every((x) => x.total === 0)).toBe(true);
  });

  it("every fighting style a ranger can take, Tasha's ones included", () => {
    const ch = reg.get("feature:fighting-style-ranger", "feature").choices![0]!;
    expect(choiceOptions(ch, reg).map((o) => o.label)).toEqual(["Archery", "Defense", "Dueling", "Two-Weapon Fighting", "Blind Fighting", "Druidic Warrior", "Thrown Weapon Fighting"]);
    // Druidic Warrior: two druid cantrips, cast with Wisdom.
    const c = ranger(2);
    c.choices["feature:fighting-style-ranger"] = { style: ["feature:style-druidic-warrior"] };
    c.choices["feature:style-druidic-warrior"] = { cantrips: ["spell:guidance", "spell:produce-flame"] };
    const s = derive(c, reg);
    expect(s.spellcasting.find((x) => x.id === "druidic-warrior")).toMatchObject({ ability: "wis" });
  });

  it("Favored Foe's die grows: 1d4, 1d6 at 6th, 1d8 at 14th", () => {
    const die = (level: number) => {
      const c = ranger(level);
      c.inventory.push({ instanceId: "bow", item: "item:longbow", equipped: true, quantity: 1 } as never);
      c.toggles.push("favored-foe");
      const a = derive(c, reg).attacks.find((x) => x.name === "Longbow")!;
      return JSON.stringify(a.damage.bonus).match(/"(\dd\d)"[^}]*Favored Foe|Favored Foe[^}]*"(\dd\d)"/)?.slice(1).find(Boolean);
    };
    expect([die(1), die(5), die(6), die(13), die(14)]).toEqual(["1d4", "1d4", "1d6", "1d6", "1d8"]);
  });

  it("Primal Awareness: a spell at 3rd, 5th, 9th, 13th and 17th level, each free once per long rest", () => {
    const has = (level: number) => {
      const s = derive(ranger(level), reg);
      return { spells: ["spell:speak-with-animals", "spell:beast-sense", "spell:speak-with-plants", "spell:locate-creature", "spell:commune-with-nature"].filter((id) => s.spells.some((x) => x.id === id)), free: s.resources.filter((r) => r.id.startsWith("primal-awareness-")).length };
    };
    expect(has(4)).toEqual({ spells: ["spell:speak-with-animals"], free: 1 });
    expect(has(5).spells).toContain("spell:beast-sense");
    expect(has(12)).toMatchObject({ free: 3 });
    expect(has(17)).toMatchObject({ spells: ["spell:speak-with-animals", "spell:beast-sense", "spell:speak-with-plants", "spell:locate-creature", "spell:commune-with-nature"], free: 5 });
    const bs = reg.find("spell:beast-sense", "spell")!;
    expect(bs).toMatchObject({ level: 2, ritual: true, concentration: true, classes: ["druid", "ranger"], text: [] });
  });

  it("Roving: +5 walking, climb and swim equal to it; Tireless and Nature's Veil: proficiency bonus uses", () => {
    const s = derive(ranger(10), reg);
    expect(s.speed.total).toBe(35);
    expect(s.speeds.map((x) => [x.mode, x.total.total])).toEqual(expect.arrayContaining([["climb", 35], ["swim", 35]]));
    expect(s.resources.find((r) => r.id === "tireless")).toMatchObject({ max: 4 });
    expect(s.actions.find((a) => a.id === "natures-veil")).toMatchObject({ economy: "bonus" });
  });

  it("multiclassing into ranger gives one ranger skill", () => {
    const c = newCharacter({ id: "f", name: "F", race: "race:human", class: "class:fighter", abilities: { str: 15, dex: 14, con: 14, int: 10, wis: 14, cha: 8 } }, reg);
    c.classes.push({ class: "class:ranger", level: 1 } as never);
    c.choices["class:ranger"] = { skills: ["survival"] };
    expect(derive(c, reg).skills.survival.proficiency).toBe(1);
  });
});

const wolf: CustomCompanion = {
  id: "w1",
  name: "Lykos",
  kind: "Animal companion",
  bond: "rangers-companion",
  size: "Medium",
  type: "beast",
  ac: 13,
  hpMax: 11,
  speed: "40 ft.",
  abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
  saves: { dex: 4 },
  traits: [],
  attacks: [{ name: "Bite", kind: "melee", toHit: 4, damage: "2d4", damageBonus: 2, damageType: "piercing" }],
  notes: "",
};

describe("Beast Master: Ranger's Companion or Primal Companion", () => {
  it("Primal Companion is on by default; switched off, Ranger's Companion takes its place", () => {
    const c = ranger(5, "subclass:beast-master");
    expect(ids(c)).toContain("feature:primal-companion");
    expect(ids(c)).not.toContain("feature:rangers-companion");
    c.optionalOff = ["feature:primal-companion"];
    expect(ids(c)).toContain("feature:rangers-companion");
    expect(ids(c)).not.toContain("feature:primal-companion");
    expect(derive(c, reg).companions.some((x) => x.id === "primal-beast")).toBe(false);
  });

  it("the bonded beast adds the proficiency bonus, and its HP max is at least 4 × ranger level", () => {
    const c = ranger(5, "subclass:beast-master");
    c.optionalOff = ["feature:primal-companion"];
    c.customCompanions = [wolf];
    const s = derive(c, reg);
    const k = s.companions.find((x) => x.id === customCompanionId("w1"))!;
    expect(k.source).toBe("Ranger's Companion");
    expect(k.custom!.bond).toEqual({ name: "Ranger's Companion", active: true });
    expect(k.command).toEqual({ economy: "action", attackInstead: false });
    expect(k.form!.ac.total).toBe(13 + 3);
    expect(k.form!.attacks[0]!.attack.total).toBe(4 + 3);
    expect(k.form!.attacks[0]!.damage.bonus.total).toBe(2 + 3);
    expect(k.form!.abilities.dex.save.total).toBe(4 + 3);
    // A save its stat block doesn't list isn't proficient: no bonus.
    expect(k.form!.abilities.str.save.total).toBe(1);
    expect(k.form!.hpMax.total).toBe(20);
    expect(k.form!.hp.current).toBe(20);
    expect(k.form!.ac.parts.at(-1)).toEqual({ label: "Proficiency bonus (Ranger's Companion)", value: 3 });
    // At 2nd... a low level its own HP is higher.
    const low = ranger(3, "subclass:beast-master");
    low.optionalOff = ["feature:primal-companion"];
    low.customCompanions = [{ ...wolf, hpMax: 15 }];
    expect(derive(low, reg).companions.find((x) => x.id === customCompanionId("w1"))!.form!.hpMax.total).toBe(15);
    // The command is the feature's, and uses your action.
    expect(s.actions.find((a) => a.id === "rangers-companion")).toMatchObject({ economy: "action", source: "Ranger's Companion" });
  });

  it("with Primal Companion in use the bond's bonuses are off, with a warning (never blocked)", () => {
    const c = ranger(5, "subclass:beast-master");
    c.customCompanions = [wolf];
    const s = derive(c, reg);
    const k = s.companions.find((x) => x.id === customCompanionId("w1"))!;
    expect(k.custom!.bond).toEqual({ name: "Ranger's Companion", active: false });
    expect(k.form!.ac.total).toBe(13);
    expect(k.command).toBeUndefined();
    expect(s.warnings.some((w) => /Ranger's Companion.*isn't in use/.test(w))).toBe(true);
    // A pet without a bond is as before.
    c.customCompanions = [{ ...wolf, bond: undefined } as CustomCompanion];
    expect(derive(c, reg).warnings.some((w) => /Ranger's Companion/.test(w))).toBe(false);
  });

  it("an existing Beast Master (Beren) keeps Primal Companion and Tasha's features", () => {
    const c = loadCharacter("beren");
    const f = ids(c);
    expect(f).toEqual(expect.arrayContaining(["feature:primal-companion", "feature:favored-foe", "feature:deft-explorer", "feature:primal-awareness"]));
    expect(f).not.toContain("feature:rangers-companion");
    expect(derive(c, reg).companions.find((x) => x.id === "primal-beast")!.command).toEqual({ economy: "bonus", attackInstead: true });
  });
});
