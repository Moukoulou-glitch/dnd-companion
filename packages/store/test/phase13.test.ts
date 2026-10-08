import { describe, expect, it } from "vitest";
import { damageAfterDefenses, derive, newCharacter, summonBlock } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 2_100_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
const druid = () => {
  const c = newCharacter({ id: "d", name: "Yoyo", race: "race:dragonborn", class: "class:druid", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 8 };
  c.hp.current = derive(c, reg).hpMax.total;
  return logOf(c);
};

describe("summons: magical damage, speeds, editing effects", () => {
  it("nonmagical resistances don't stop magical attacks", () => {
    const garg = { resist: ["bludgeoning, piercing, and slashing from nonmagical weapons that aren't adamantine"], immune: ["poison"], vulnerable: [] };
    expect(damageAfterDefenses(10, "slashing", garg).amount).toBe(5);
    expect(damageAfterDefenses(10, "slashing", garg, { magical: true }).amount).toBe(10);
    expect(damageAfterDefenses(10, "slashing", garg, { adamantine: true }).amount).toBe(10);
    expect(damageAfterDefenses(10, "fire", garg).amount).toBe(10);
    expect(damageAfterDefenses(10, "poison", garg, { magical: true }).amount).toBe(0);
    const wolf = { resist: ["bludgeoning, piercing, and slashing from nonmagical weapons that aren't silvered"], immune: [], vulnerable: [] };
    expect(damageAfterDefenses(9, "piercing", wolf, { silvered: true }).amount).toBe(9);
  });

  it("a gargoyle walks 30 and flies 60; effects can be edited: rounds, Aid's level", () => {
    const log = druid();
    log.record("summon", { spell: "spell:conjure-minor-elementals", group: "g", creatures: [{ creature: "creature:gargoyle", count: 1 }] });
    const m = () => log.character.summons[0]!;
    expect(summonBlock(reg, m())!.speeds).toEqual({ walk: 30, fly: 60 });
    log.record("summonEconomy", { id: m().id, move: 20, mode: "fly" });
    expect(log.record("summonEconomy", { id: m().id, move: 15, mode: "walk" }).join(" ")).toMatch(/beyond its walk speed \(30 ft\)/);
    log.record("summonHp", { id: m().id, damage: 10, type: "slashing", magical: true });
    expect(m().hp).toBe(42);
    log.record("summonEffect", { id: m().id, effect: "effect:aid", add: true });
    expect(m().hp).toBe(47);
    const aid = m().effects![0]!.id;
    log.record("summonEffectEdit", { id: m().id, instance: aid, slotLevel: 4 });
    expect(m().hp).toBe(57);
    expect(summonBlock(reg, m())!.hp.max).toBe(67);
    log.record("summonEffectEdit", { id: m().id, instance: aid, rounds: 3 });
    expect(m().effects![0]!.rounds).toBe(3);
    expect(log.record("summonEffect", { id: m().id, effect: "condition:prone", add: true }).join(" ")).toMatch(/falls/);
  });
});

describe("hit points, ability scores, inspiration by hand", () => {
  it("maximum hit points go down and up by hand, and back to normal at 0", () => {
    const log = druid();
    const normal = derive(log.character, reg).hpMax.total;
    log.record("setMaxHpAdjust", { reduce: 10 });
    expect(derive(log.character, reg).hpMax.total).toBe(normal - 10);
    expect(log.character.hp.current).toBe(normal - 10);
    log.record("setMaxHpAdjust", { increase: 4 });
    expect(derive(log.character, reg).hpMax.total).toBe(normal - 6);
    log.record("setMaxHpAdjust", { reduce: 0, increase: 0 });
    expect(derive(log.character, reg).hpMax.total).toBe(normal);
  });

  it("hit point rolls are kept and can be corrected", () => {
    const log = druid();
    const before = derive(log.character, reg).hpMax.total;
    log.record("setHpRoll", { class: "class:druid", index: 0, value: 8 });
    expect(log.character.classes[0]!.hpRolls).toEqual([8]);
    expect(derive(log.character, reg).hpMax.total).toBe(before + 3);
  });

  it("Strength drain until a rest; Amulet of Health makes Constitution 19 unless higher", () => {
    const log = druid();
    log.record("setAbilityAdjust", { ability: "str", penalty: 3, penaltyEndsOnRest: true });
    expect(derive(log.character, reg).abilities.str.score.total).toBe(9);
    log.record("setAbilityAdjust", { ability: "con", setTo: 19, setNote: "Amulet of Health" });
    const s = derive(log.character, reg);
    expect(s.abilities.con.score.total).toBe(19);
    expect(s.abilities.con.score.parts.at(-1)!.label).toMatch(/Becomes 19 \(Amulet of Health\)/);
    log.record("rest", { kind: "short" });
    expect(derive(log.character, reg).abilities.str.score.total).toBe(12);
    log.record("setAbilityAdjust", { ability: "wis", setTo: 12 });
    expect(derive(log.character, reg).abilities.wis.score.total).toBe(16);
  });

  it("inspiration: up to 10, offered on d20 rolls as advantage", () => {
    const log = druid();
    log.record("setInspiration", { count: 10 });
    const s = derive(log.character, reg);
    expect(s.saves.wis.suggestions.some((x) => x.label === "Inspiration" && x.apply.mode === "advantage")).toBe(true);
    log.record("setInspiration", { count: 9 });
    expect(log.character.inspirations).toBe(9);
  });
});
