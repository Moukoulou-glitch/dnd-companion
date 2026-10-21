import { describe, expect, it } from "vitest";
import { backupCost, buildItems, copyCost, derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_793_000_000_000;
const log = (level = 3, subclass?: string) => {
  const c = newCharacter({ id: "w", name: "Wen", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 10, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, ...(subclass ? { subclass } : {}) };
  c.spellbookFunds = 500;
  return new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
};
const book = (l: CharacterLog) => buildItems(l.character, reg).find((i) => i.spellKind === "spellbook")!.picked;
const sp = (l: CharacterLog, id: string) => derive(l.character, reg).spells.find((x) => x.id === id);

describe("Wizard spellbook: copy, prepare, and what it costs", () => {
  it("copying costs 2 hours and 50 gp per level; a Savant halves both; the Wizardly Quill makes it 2 minutes per level", () => {
    expect(copyCost(log().character, reg, "spell:fireball")).toEqual({ gp: 150, minutes: 360 });
    const evoker = copyCost(log(3, "subclass:evocation").character, reg, "spell:fireball");
    expect(evoker?.gp).toBe(75);
    expect(evoker?.minutes).toBe(180);
    expect(evoker?.savant).toBeTruthy();
    const scribe = copyCost(log(3, "subclass:order-of-scribes").character, reg, "spell:fireball");
    expect(scribe).toMatchObject({ gp: 150, minutes: 6, quill: "Wizardly Quill" });
    expect(copyCost(log().character, reg, "spell:fire-bolt")).toBeUndefined();
  });
  it("prepared today without being in the spellbook: warned, prepared, not in the book", () => {
    const l = log();
    const notes = l.record("learnSpell", { spell: "spell:shield", list: "wizard", notInBook: true, prepared: true });
    expect(notes.join(" ")).toMatch(/normally a wizard prepares only from the spellbook/);
    expect(sp(l, "spell:shield")).toMatchObject({ ready: "prepared", notInBook: true });
    expect(book(l)).not.toContain("spell:shield");
    // Copying it in later: the gold is paid, it's in the book and still prepared.
    expect(l.record("learnSpell", { spell: "spell:shield", list: "wizard", cost: 50 }).join(" ")).toMatch(/50 gp from the spellbook fund: 450 gp left/);
    expect(sp(l, "spell:shield")?.notInBook).toBeUndefined();
    expect(sp(l, "spell:shield")?.ready).toBe("prepared");
    expect(book(l)).toContain("spell:shield");
  });
  it("unprepared, a spell that isn't in the book leaves the sheet; out of the book, a prepared one stays prepared", () => {
    const l = log();
    l.record("learnSpell", { spell: "spell:shield", list: "wizard", notInBook: true, prepared: true });
    l.record("setPrepared", { spell: "spell:shield", list: "wizard", prepared: false });
    expect(sp(l, "spell:shield")).toBeUndefined();
    l.record("learnSpell", { spell: "spell:sleep", list: "wizard" });
    l.record("setPrepared", { spell: "spell:sleep", list: "wizard", prepared: true });
    expect(l.record("forgetSpell", { spell: "spell:sleep", list: "wizard", keepPrepared: true }).join(" ")).toMatch(/stays prepared/);
    expect(sp(l, "spell:sleep")).toMatchObject({ ready: "prepared", notInBook: true });
  });
  it("a backup: 1 hour and 10 gp per level of each spell in the book (not the ones only prepared)", () => {
    const l = log();
    l.record("learnSpell", { spell: "spell:sleep", list: "wizard" });
    l.record("learnSpell", { spell: "spell:fireball", list: "wizard" });
    l.record("learnSpell", { spell: "spell:shield", list: "wizard", notInBook: true, prepared: true });
    expect(backupCost(l.character, reg)).toEqual({ gp: 40, minutes: 240, spells: 2 });
  });
});
