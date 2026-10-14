import { describe, expect, it } from "vitest";
import { bookPack, derive, newCharacter } from "@dnd/engine";
import { composeDamage, rollComposed, seededRng } from "@dnd/dice";
import type { SpellDef } from "@dnd/schema";
import { tableRegistry } from "../../engine/test/helpers.js";
import { classFromFileName } from "../../engine/src/books/spells.js";
import { spellAsAttack } from "../src/components/SpellsTab.js";
import { recordOf } from "../src/rolls.js";

const reg = tableRegistry();
const caster = (cls: string, level: number, r = reg) => {
  const c = newCharacter({ id: cls, name: "X", race: "race:human", class: `class:${cls}`, abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 16, cha: 16 } }, r);
  c.classes[0] = { ...c.classes[0]!, level };
  return c;
};
/** The spell as the sheet shows it, known or prepared on that class's list. */
const spellOf = (cls: string, level: number, id: string, r = reg) => {
  const c = caster(cls, level, r);
  c.spells.push({ spell: id, list: cls, prepared: true });
  return derive(c, r).spells.find((s) => s.id === id)!;
};

describe("Spells with two damage types", () => {
  it("Ice Storm: 2d8 bludgeoning (more when upcast) and 4d6 cold, as separate parts", () => {
    const def = reg.find("spell:ice-storm", "spell") as SpellDef;
    expect(def.damage).toMatchObject({ type: "bludgeoning", atSlot: { "4": "2d8", "5": "3d8", "9": "7d8" }, also: [{ type: "cold", atSlot: { "4": "4d6", "9": "4d6" } }] });
    const sp = spellOf("druid", 7, "spell:ice-storm");
    expect(sp.damage?.byLevel[4]).toBe("2d8");
    expect(sp.damage?.byLevel[6]).toBe("4d8");
    expect(sp.damage?.also).toEqual([{ type: "cold", byLevel: { 4: "4d6", 5: "4d6", 6: "4d6", 7: "4d6", 8: "4d6", 9: "4d6" } }]);
  });

  it("the roll has a dice group per type, and the result keeps the split (so resistances can apply per type)", () => {
    const sp = spellOf("druid", 7, "spell:ice-storm");
    const a = spellAsAttack(sp, 4);
    const c = composeDamage(a.damage.dice, a.damage.type, a.damage.bonus, undefined, sp.name);
    const dice = c.terms.filter((t) => t.kind === "dice");
    expect(dice.map((t) => (t.kind === "dice" ? `${t.count}d${t.sides} ${t.label}` : ""))).toEqual(["2d8 bludgeoning", "4d6 cold"]);
    const rec = recordOf("Ice Storm damage", "damage", rollComposed(c, undefined, seededRng(3)));
    expect(Object.keys(rec.byType!).sort()).toEqual(["bludgeoning", "cold"]);
    expect(rec.byType!.bludgeoning! + rec.byType!.cold!).toBe(rec.total);
    expect(rec.byType!.bludgeoning).toBeGreaterThanOrEqual(2);
    expect(rec.byType!.cold).toBeGreaterThanOrEqual(4);
    // Upcast: only the bludgeoning grows.
    const up = composeDamage(spellAsAttack(sp, 6).damage.dice, "bludgeoning", spellAsAttack(sp, 6).damage.bonus);
    expect(up.terms.filter((t) => t.kind === "dice").map((t) => (t.kind === "dice" ? `${t.count}d${t.sides}` : ""))).toEqual(["4d8", "4d6"]);
  });

  it("Flame Strike (4d6 fire + 4d6 radiant) and Meteor Swarm (20d6 fire + 20d6 bludgeoning) are fixed the same way", () => {
    const fs = spellOf("cleric", 9, "spell:flame-strike");
    expect(fs.damage?.byLevel[5]).toBe("4d6");
    expect(fs.damage?.byLevel[7]).toBe("6d6");
    expect(fs.damage?.also?.[0]).toMatchObject({ type: "radiant", byLevel: { 5: "4d6", 9: "4d6" } });
    // The old data said "4d6 OR 5d6": no such formula any more.
    expect(Object.values(fs.damage!.byLevel).some((x) => /OR/.test(x))).toBe(false);
    const ms = spellOf("wizard", 17, "spell:meteor-swarm");
    expect(ms.damage).toMatchObject({ type: "fire", byLevel: { 9: "20d6" }, also: [{ type: "bludgeoning", byLevel: { 9: "20d6" } }] });
  });

  it("a one-type spell is unchanged", () => {
    const fb = spellOf("wizard", 5, "spell:fireball");
    expect(fb.damage?.also).toBeUndefined();
    expect(fb.damage).toMatchObject({ type: "fire", byLevel: { 3: "8d6" } });
  });
});

// Invented text in the export's format: never book text.
const wave = (classes = "") =>
  [
    "#### Sample Wave",
    "*Level 3 Conjuration*",
    "___",
    "- **Casting Time:** Action",
    "- **Range:** 120 feet",
    "- **Components:** V, S",
    "- **Duration:** Instantaneous",
    "---",
    "Invented words for a test. Each creature in the area must make a Dexterity saving throw, taking 4d8 bludgeoning damage on a failed save, or half as much damage on a successful one.",
    ...(classes ? ["", classes] : []),
  ].join("\n");

describe("Spell lists exported one class at a time (XGtE)", () => {
  it("reads the class from the file name", () => {
    expect(classFromFileName("1792011319651_spells_available_to_druids_xge.md")).toBe("druid");
    expect(classFromFileName("spells_available_to_sorcerers_xge.md")).toBe("sorcerer");
    expect(classFromFileName("spells_available_to_wizards_xge.md")).toBe("wizard");
    expect(classFromFileName("spells_available_to_paladins_xge.md")).toBe("paladin");
    expect(classFromFileName("spells_available_to_artificers_tce.md")).toBeUndefined();
    expect(classFromFileName("spells.md")).toBeUndefined();
  });

  it("a spell in several class files gets every one of those classes, and shows on the druid's list without any option", () => {
    const files = ["druids", "sorcerers", "wizards"].map((c) => ({ name: `1792_spells_available_to_${c}_xge.md`, text: wave() }));
    const { pack } = bookPack(files, reg);
    const def = pack.definitions.find((d) => d.id === "spell:sample-wave") as SpellDef;
    expect(def.classes.sort()).toEqual(["druid", "sorcerer", "wizard"]);
    const r2 = tableRegistry();
    r2.add(pack);
    const c = caster("druid", 5, r2);
    expect(derive(c, r2).spells.some((s) => s.id === "spell:sample-wave")).toBe(true);
    // It's an ordinary druid spell (Xanathar's lists), not one of Tasha's: switching the optional feature off doesn't remove it.
    c.optionalOff = ["feature:druid-additional-druid-spells"];
    expect(derive(c, r2).spells.some((s) => s.id === "spell:sample-wave")).toBe(true);
    // Another class doesn't get it.
    expect(derive(caster("cleric", 5, r2), r2).spells.some((s) => s.id === "spell:sample-wave")).toBe(false);
  });

  it("“Optional/Variant Classes” with each class twice is read once, and follows the optional feature", () => {
    const { pack } = bookPack([{ name: "spells.md", text: wave("**Optional/Variant Classes:** Druid, Druid, Sorcerer, Sorcerer, Wizard, Wizard") }], reg);
    const def = pack.definitions.find((d) => d.id === "spell:sample-wave") as SpellDef;
    expect(def.optionalClasses).toEqual(["druid", "sorcerer", "wizard"]);
    expect(def.text.join(" ")).not.toMatch(/Optional\/Variant/);
    const r2 = tableRegistry();
    r2.add(pack);
    const c = caster("druid", 5, r2);
    expect(derive(c, r2).spells.some((s) => s.id === "spell:sample-wave")).toBe(true);
    c.optionalOff = ["feature:druid-additional-druid-spells"];
    expect(derive(c, r2).spells.some((s) => s.id === "spell:sample-wave")).toBe(false);
  });

  it("a class file adds its class to a spell the app already has without replacing its own classes", () => {
    // Maximilian's Earthen Grasp is a placeholder (sorcerer, wizard); a sorcerer list file adds nothing new, a druid one would add druid.
    const text = wave().replace("Sample Wave", "Maximilian's Earthen Grasp");
    const { pack } = bookPack([{ name: "spells_available_to_druids_x.md", text }], reg);
    const def = pack.definitions.find((d) => d.id === "spell:maximilians-earthen-grasp") as SpellDef;
    expect(def.classes.sort()).toEqual(["druid", "sorcerer", "wizard"]);
  });
});
