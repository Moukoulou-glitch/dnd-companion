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

describe("Your own actions and spells", () => {
  it("a custom attack, a save that deals damage, healing with uses, and a custom spell", () => {
    const l = log();
    // Str 14, Dex 12, Cha 16 (human: 15/13/17): Cha +3, Str +2, pb +3.
    l.record("setCustomAction", { action: { id: "a1", name: "Horn Gore", economy: "bonus", source: "Minotaur blood", kind: "attack", attack: { mode: "melee", ability: "cha", proficient: true, bonus: 1, damage: "1d8", addAbility: true, damageBonus: 2, damageType: "piercing" } } });
    l.record("setCustomAction", { action: { id: "a2", name: "Dread Howl", economy: "action", kind: "save", save: { ability: "wis", dc: "cha", onSuccess: "none", damage: "2d6", damageType: "psychic", condition: "condition:frightened" }, target: "creatures within 30 ft", duration: { rounds: 10 }, uses: { max: 1, reset: "short" } } });
    l.record("setCustomAction", { action: { id: "a3", name: "Second Breath", economy: "bonus", kind: "heal", heal: { amount: "1d10 + 6", temp: false }, uses: { max: 2, reset: "long" } } });
    const s = derive(l.character, reg);
    const gore = s.attacks.find((x) => x.attackId === "custom-a1")!;
    expect(gore.action).toBe("bonus");
    expect(gore.attack.total).toBe(3 + 3 + 1);
    expect(gore.damage.bonus.total).toBe(3 + 2);
    const howl = s.actions.find((x) => x.id === "custom-a2")!;
    expect(howl.dc?.value).toBe(8 + 3 + 3);
    expect(howl.duration).toEqual({ rounds: 10 });
    expect(howl.cost?.remaining).toBe(1);
    expect(howl.note).toMatch(/Frightened/);
    expect(s.actions.find((x) => x.id === "custom-a3")?.heal?.text).toBe("1d10 + 6");
    l.record("useAction", { action: "custom-a2" });
    expect(derive(l.character, reg).actions.find((x) => x.id === "custom-a2")?.cost?.remaining).toBe(0);
    l.record("removeCustomAction", { id: "a1" });
    expect(derive(l.character, reg).attacks.some((x) => x.attackId === "custom-a1")).toBe(false);
  });
  it("a custom spell is cast with a spell list, upcast and all", () => {
    const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 10, cha: 10 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 5 };
    const l = new CharacterLog(c, reg, new HybridClock("t2", () => (t += 1000)), "player");
    l.record("setCustomSpell", { list: "wizard", spell: { id: "s1", name: "Ember Lance", level: 2, school: "Evocation", attack: "ranged", damage: { dice: "3d6", type: "fire", perSlot: "1d6", addMod: false, cantripScaling: false }, description: "A lance of embers." } });
    const sp = derive(l.character, reg).spells.find((x) => x.id === "spell:custom-s1")!;
    expect(sp.attack?.total).toBe(3 + 3);
    expect(JSON.stringify(sp)).toMatch(/4d6/);
    l.record("removeCustomSpell", { id: "s1" });
    expect(derive(l.character, reg).spells.some((x) => x.id === "spell:custom-s1")).toBe(false);
  });
});
