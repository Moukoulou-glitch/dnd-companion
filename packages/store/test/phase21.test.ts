import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_791_000_000_000;
const log = (feat?: string) => {
  const c = newCharacter({ id: "a", name: "Asmo", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 16 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 6 };
  if (feat) c.feats.push({ feat, source: "asi" } as never);
  return new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
};

describe("Durable, exhaustion and instant death", () => {
  it("Durable: Hit Dice heal at least twice Con, soak damage, and all come back on a long rest", () => {
    const l = log("feat:durable");
    expect(derive(l.character, reg).rules.durable).toBe(true);
    l.record("damage", { amount: 30 });
    const before = l.character.hp.current;
    l.record("spendHitDie", { die: "d10", roll: 1 });
    // Con 16 (human and Durable +1 each): +3; 1 + 3 = 4, Durable makes it 6.
    expect(l.character.hp.current).toBe(before + 6);
    const notes = l.record("spendHitDie", { die: "d10", roll: 6, reduce: true });
    expect(notes.join(" ")).toMatch(/reduced by 9/);
    expect(l.character.hp.current).toBe(before + 6);
    l.record("rest", { kind: "long" });
    expect(l.character.hitDiceUsed.d10 ?? 0).toBe(0);
  });
  it("a long rest takes one level of Exhaustion away", () => {
    const l = log();
    l.record("addEffect", { instanceId: "ex", effect: "condition:exhaustion", level: 2 });
    l.record("rest", { kind: "long" });
    expect(l.character.effects.find((e) => e.effect === "condition:exhaustion")?.level).toBe(1);
    l.record("rest", { kind: "long" });
    expect(l.character.effects.some((e) => e.effect === "condition:exhaustion")).toBe(false);
  });
  it("massive damage is instant death", () => {
    const l = log();
    const max = derive(l.character, reg).hpMax.total;
    l.record("damage", { amount: max * 2 + 5 });
    expect(l.character.deathSaves.failures).toBe(3);
    expect(l.lastPrompts.some((p) => p.kind === "dead")).toBe(true);
  });
});

describe("Speeds, bonuses by hand, timers", () => {
  const mk = (race: string, cls = "class:fighter") => newCharacter({ id: "s", name: "S", race, class: cls, abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 14, cha: 14 } }, reg);
  it("climb, swim and fly speeds come from features and effects, and Grappled stops them", () => {
    const tab = mk("race:tabaxi");
    expect(derive(tab, reg).speeds).toEqual([expect.objectContaining({ mode: "climb", total: expect.objectContaining({ total: 20 }) })]);
    const aas = mk("race:protector-aasimar");
    expect(derive(aas, reg).speeds).toEqual([]);
    aas.toggles.push("radiant-soul");
    expect(derive(aas, reg).speeds.find((x) => x.mode === "fly")?.total.total).toBe(30);
    aas.effects.push({ id: "f", effect: "effect:fly" } as never);
    expect(derive(aas, reg).speeds.find((x) => x.mode === "fly")?.total.total).toBe(60);
    aas.effects.push({ id: "g", effect: "condition:grappled" } as never);
    expect(derive(aas, reg).speeds.find((x) => x.mode === "fly")?.total.total).toBe(0);
  });
  it("bonuses and penalties by hand on all saves, one skill and passives", () => {
    const c = mk("race:human");
    const before = derive(c, reg);
    c.rollAdjust["save.all"] = { bonus: 1, penalty: 0, note: "Cloak of Protection" };
    c.rollAdjust["save.wis"] = { bonus: 0, penalty: 2 };
    c.rollAdjust["skill.stealth"] = { bonus: 3, penalty: 1 };
    c.rollAdjust["passive.perception"] = { bonus: 5, penalty: 0 };
    const s = derive(c, reg);
    expect(s.saves.str.total).toBe(before.saves.str.total + 1);
    expect(s.saves.wis.total).toBe(before.saves.wis.total - 1);
    expect(s.skills.stealth.total).toBe(before.skills.stealth.total + 2);
    expect(s.passives.perception.total).toBe(before.passives.perception.total + 5);
  });
  it("features that say how long they last get a timer", () => {
    const c = mk("race:human", "class:cleric");
    c.classes[0] = { ...c.classes[0]!, level: 2 };
    expect(derive(c, reg).actions.find((a) => a.id === "turn-undead")?.duration).toEqual({ rounds: 10 });
  });
});
