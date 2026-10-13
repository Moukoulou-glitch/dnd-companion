import { describe, expect, it } from "vitest";
import { derive, newCharacter, readiedNow, turnWarnings, warCasterSpells } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_796_000_000_000;
const log = (c: ReturnType<typeof newCharacter>) => new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");

describe("Healing Hands: on you only when you say so", () => {
  const aasimar = () => {
    const c = newCharacter({ id: "a", name: "A", race: "race:protector-aasimar", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 16 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 4 };
    c.hp.current = 10;
    return log(c);
  };
  it("is marked as something that can go to another creature", () => {
    expect(derive(aasimar().character, reg).actions.find((a) => a.id === "healing-hands")?.others).toBe(true);
  });
  it("unticked: the use is spent and your HP stay; ticked: you heal", () => {
    const l = aasimar();
    l.record("useAction", { action: "healing-hands", rolled: 4, onMe: false });
    expect(l.character.hp.current).toBe(10);
    expect(derive(l.character, reg).actions.find((a) => a.id === "healing-hands")?.cost?.remaining).toBe(0);
    l.record("rest", { kind: "long" });
    l.record("damage", { amount: 20 });
    const hp = l.character.hp.current;
    l.record("useAction", { action: "healing-hands", rolled: 4, onMe: true });
    expect(l.character.hp.current).toBe(hp + 4);
  });
});

describe("Readied action and the reaction", () => {
  const fighter = () => {
    const c = newCharacter({ id: "f", name: "F", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    return log(c);
  };
  it("warns before spending the reaction on something else, and only then", () => {
    const l = fighter();
    l.record("startCombat", {});
    const warn = () => turnWarnings(l.character, derive(l.character, reg), { name: "Reaction", economy: "reaction" });
    expect(warn()).toEqual([]);
    l.record("startTurn", {});
    l.record("useAction", { action: "common-ready", choice: "Attack" });
    expect(readiedNow(l.character)).toEqual({ name: "Attack" });
    expect(warn().some((w) => /readied Attack/.test(w) && /can't take the readied action/.test(w))).toBe(true);
    // Releasing it is what the reaction was kept for.
    expect(turnWarnings(l.character, derive(l.character, reg), { name: "Ready: Attack", economy: "reaction", releasesReadied: true })).toEqual([]);
    // Actions and bonus actions aren't affected.
    expect(turnWarnings(l.character, derive(l.character, reg), { name: "Second Wind", economy: "bonus" }).some((w) => /readied/.test(w))).toBe(false);
    // Reaction already used: the usual "already used" warning, not the readied one.
    l.record("useEconomy", { kind: "reaction", amount: 1 });
    expect(warn().some((w) => /readied/.test(w))).toBe(false);
  });
  it("a readied spell says it's held with concentration and lost if not released", () => {
    const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 10, cha: 10 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 5 };
    c.spells.push({ spell: "spell:magic-missile", list: "wizard", prepared: true });
    const l = log(c);
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("castSpell", { spell: "spell:magic-missile", list: "wizard", level: 1, using: "slot", readied: true });
    expect(readiedNow(l.character)).toEqual({ name: "Magic Missile", spell: "spell:magic-missile" });
    const w = turnWarnings(l.character, derive(l.character, reg), { name: "Shield", economy: "reaction", spell: { level: 1, concentration: false } });
    expect(w.some((x) => /holding Magic Missile \(readied, with concentration\)/.test(x) && /lost if it isn't released/.test(x))).toBe(true);
  });
});

describe("War Caster: spells offered as an opportunity attack", () => {
  const wizard = (withFeat: boolean) => {
    const c = newCharacter({ id: "z", name: "Z", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 10, cha: 10 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 5 };
    if (withFeat) c.feats.push({ feat: "feat:war-caster", from: "Level 4 ASI" });
    for (const s of ["fire-bolt", "shocking-grasp", "magic-missile", "hold-person", "fireball", "shield", "misty-step", "thunderwave"]) c.spells.push({ spell: `spell:${s}`, list: "wizard", prepared: s !== "hold-person" });
    return c;
  };
  it("lists only known/prepared 1-action spells that can target just that creature", () => {
    const ids = warCasterSpells(derive(wizard(true), reg)).map((s) => s.id).sort();
    expect(ids).toEqual(["spell:fire-bolt", "spell:magic-missile", "spell:shocking-grasp"]);
    // Not prepared (Hold Person), an area (Fireball, Thunderwave), a reaction (Shield), a bonus action (Misty Step): none.
  });
  it("nothing without the feat", () => {
    expect(warCasterSpells(derive(wizard(false), reg))).toEqual([]);
  });
});
