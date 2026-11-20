import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_899_100_000_000;

describe("23q: Twilight Sanctuary", () => {
  const pc = () => {
    const c = newCharacter({ id: "tw", name: "Tw", race: "race:human", class: "class:cleric", abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
    c.classes = [{ class: "class:cleric", level: 4, subclass: "subclass:twilight-domain" }];
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("lasts 10 rounds, counting down with your turns", () => {
    const l = pc();
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("useAction", { action: "twilight-sanctuary" });
    const timer = l.character.effects.find((e) => e.toggles?.includes("twilight-sanctuary"))!;
    expect(timer.rounds).toBe(10);
    expect(timer.minutes).toBeUndefined();
    l.record("endTurn", {});
    expect(l.character.effects.find((e) => e.id === timer.id)?.rounds).toBe(9);
  });
  it("its end-of-turn benefit has no once-a-turn limit", () => {
    const l = pc();
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("useAction", { action: "twilight-sanctuary" });
    const s = derive(l.character, reg);
    const a = s.actions.find((x) => x.id === "twilight-sanctuary-turn")!;
    expect(a.anyTimes).toBe(true);
  });
});

describe("23t: short rests are counted between long rests", () => {
  it("counts them, warns from the fourth (never refuses), and a long rest starts the count again", () => {
    const c = newCharacter({ id: "sr", name: "Sr", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    for (let i = 1; i <= 3; i++) {
      const r = l.record("rest", { kind: "short" });
      expect(l.character.shortRests).toBe(i);
      expect(r.some((n) => n.startsWith("⚠ Short rest"))).toBe(false);
    }
    const fourth = l.record("rest", { kind: "short" });
    expect(l.character.shortRests).toBe(4);
    expect(fourth).toContain("⚠ Short rest 4 since your last long rest: the table allows 3. Done anyway.");
    l.record("rest", { kind: "long" });
    expect(l.character.shortRests).toBeUndefined();
  });
});

describe("23u: a rope's length", () => {
  it("is kept on the item, and null brings it back to as it comes", () => {
    const c = newCharacter({ id: "rp", name: "Rp", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    c.inventory.push({ id: "rope", item: "item:rope-hempen-50-feet", quantity: 1, equipped: false, attuned: false });
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("setItem", { instanceId: "rope", amount: 30 });
    expect(l.character.inventory.find((i) => i.id === "rope")!.amount).toBe(30);
    expect(derive(l.character, reg).encumbrance.carried).toBeLessThan(derive(c, reg).encumbrance.carried);
    l.record("setItem", { instanceId: "rope", amount: null });
    expect(l.character.inventory.find((i) => i.id === "rope")!.amount).toBeUndefined();
  });
});

describe("23x: several Hit Dice at once, and uses set by hand", () => {
  const fighter = () => {
    const c = newCharacter({ id: "hd", name: "Hd", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    c.classes = [{ class: "class:fighter", level: 5 }];
    c.hp.current = 1;
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("spends each die with its own roll, and stops when none are left", () => {
    const l = fighter();
    l.record("spendHitDie", { die: "d10", roll: 4, more: [6, 1] });
    expect(l.character.hitDiceUsed.d10).toBe(3);
    expect(l.character.hp.current).toBe(1 + (4 + 2) + (6 + 2) + (1 + 2));
    const notes = l.record("spendHitDie", { die: "d10", roll: 2, more: [2, 2] });
    expect(l.character.hitDiceUsed.d10).toBe(5);
    expect(notes.some((n) => /No d10 Hit Dice left after 2/.test(n))).toBe(true);
  });
  it("a pool's points can go down or up by any amount (Lay on Hands)", () => {
    const c = newCharacter({ id: "lo", name: "Lo", race: "race:human", class: "class:paladin", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 14 } }, reg);
    c.classes = [{ class: "class:paladin", level: 5 }];
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("spendResource", { resource: "lay-on-hands", amount: 17 });
    expect(derive(l.character, reg).resources.find((r) => r.id === "lay-on-hands")!.remaining).toBe(8);
    l.record("restoreResource", { resource: "lay-on-hands", amount: 5 });
    expect(derive(l.character, reg).resources.find((r) => r.id === "lay-on-hands")!.remaining).toBe(13);
  });
});

describe("24a: Lay on Hands' cure", () => {
  it("spends 5 points a poison or disease and heals nothing", () => {
    const c = newCharacter({ id: "lc", name: "Lc", race: "race:human", class: "class:paladin", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 14 } }, reg);
    c.classes = [{ class: "class:paladin", level: 3 }];
    c.hp.current = 10;
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    expect(derive(l.character, reg).actions.find((a) => a.id === "lay-on-hands")!.spendAmount?.cures).toEqual({ each: 5, label: "Cure a disease or neutralize a poison" });
    l.record("useAction", { action: "lay-on-hands", amount: 10, healSelf: false, onMe: true });
    expect(l.character.hp.current).toBe(10);
    expect(derive(l.character, reg).resources.find((r) => r.id === "lay-on-hands")!.remaining).toBe(5);
  });
});

describe("24b: Contagion on you", () => {
  const mk = () => {
    const c = newCharacter({ id: "ct", name: "Ct", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    c.classes = [{ class: "class:fighter", level: 5 }];
    c.inventory.push({ id: "ls", item: "item:longsword", quantity: 1, equipped: true, attuned: false });
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("poisoned while saving; the picked disease gives its own penalties", () => {
    const l = mk();
    l.record("addEffect", { instanceId: "cg", effect: "effect:contagion", choice: "Poisoned (saving)" });
    expect(derive(l.character, reg).effects.find((e) => e.id === "effect:contagion")!.includes.map((x) => x.id)).toContain("condition:poisoned");
    l.record("updateEffect", { instanceId: "cg", choice: "Filth Fever" });
    const s = derive(l.character, reg);
    expect(s.saves.str.disadvantage.join(" ")).toMatch(/Filth Fever/);
    expect(s.saves.dex.disadvantage.join(" ")).not.toMatch(/Contagion/);
    expect(s.attacks.find((a) => a.name === "Longsword")!.attack.disadvantage.join(" ")).toMatch(/Filth Fever/);
  });
  it("Flesh Rot: vulnerable to all damage", () => {
    const l = mk();
    l.record("addEffect", { instanceId: "cg", effect: "effect:contagion", choice: "Flesh Rot" });
    const hp = l.character.hp.current;
    l.record("damage", { amount: 5, damageType: "fire" });
    expect(hp - l.character.hp.current).toBe(10);
  });
});

describe("24c: custom effects with conditions, and the disease tag", () => {
  const mk = (cls = "class:fighter") => {
    const c = newCharacter({ id: "cd", name: "Cd", race: "race:human", class: cls, abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
    c.classes = [{ class: cls, level: 9 }];
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  const addRot = (l: CharacterLog) => l.record("addEffect", { instanceId: "rot", effect: "custom", custom: { name: "Sewer Rot", modifiers: [], includes: ["condition:poisoned"], disease: true } });
  it("a custom effect's conditions apply and show on its card", () => {
    const l = mk();
    addRot(l);
    const s = derive(l.character, reg);
    const e = s.effects.find((x) => x.instanceId === "rot")!;
    expect(e.includes.map((x) => x.id)).toEqual(["condition:poisoned"]);
    expect(e.disease).toBe(true);
    // Poisoned: disadvantage on ability checks.
    expect(s.skills.athletics.disadvantage.length).toBeGreaterThan(0);
  });
  it("Lesser Restoration's 'A disease' cures it", () => {
    const l = mk();
    addRot(l);
    l.record("addEffect", { instanceId: "lr", effect: "effect:lesser-restoration", choice: "A disease" });
    expect(l.character.effects.some((e) => e.id === "rot")).toBe(false);
  });
  it("Heroes' Feast on you ends every disease", () => {
    const l = mk();
    addRot(l);
    l.record("addEffect", { instanceId: "cg", effect: "effect:contagion", choice: "Seizure" });
    l.record("addEffect", { instanceId: "hf", effect: "effect:heroes-feast", choice: "10" });
    expect(l.character.effects.filter((e) => e.id === "rot" || e.id === "cg")).toHaveLength(0);
  });
});

describe("24d: exhaustion levels on a custom effect", () => {
  it("add to your own, apply once, and can be changed", () => {
    const c = newCharacter({ id: "ex", name: "Ex", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    const walk = derive(l.character, reg).speed.total;
    l.record("addEffect", { instanceId: "own", effect: "condition:exhaustion" });
    l.record("addEffect", { instanceId: "fever", effect: "custom", custom: { name: "Marsh Fever", modifiers: [], exhaustion: 1 } });
    let s = derive(l.character, reg);
    expect(s.speed.total).toBe(Math.floor(walk / 2)); // exhaustion 2: speed halved, once
    expect(s.effects.find((e) => e.instanceId === "fever")!.exhaustion).toBe(1);
    l.record("updateEffect", { instanceId: "fever", exhaustion: 0 });
    s = derive(l.character, reg);
    expect(s.speed.total).toBe(walk); // back to exhaustion 1
    l.record("removeEffect", { instanceId: "own" });
    l.record("updateEffect", { instanceId: "fever", exhaustion: 2 });
    expect(derive(l.character, reg).speed.total).toBe(Math.floor(walk / 2));
  });
});

describe("24e: the Iron Flask holds one creature", () => {
  it("keeps it, warns when a second replaces it, and releases it as a summoned creature", () => {
    const c = newCharacter({ id: "if", name: "If", race: "race:human", class: "class:wizard", abilities: { str: 10, dex: 12, con: 14, int: 16, wis: 10, cha: 10 } }, reg);
    c.inventory.push({ id: "fl", item: "item:iron-flask", quantity: 1, equipped: false, attuned: false });
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("setItem", { instanceId: "fl", holds: { creature: "creature:djinni", name: "Djinni" } });
    expect(l.character.inventory[0]!.holds).toEqual({ creature: "creature:djinni", name: "Djinni" });
    const notes = l.record("setItem", { instanceId: "fl", holds: { name: "Glimmerfiend" } });
    expect(notes.some((n) => /already held Djinni/.test(n))).toBe(true);
    expect(l.character.inventory[0]!.holds).toEqual({ name: "Glimmerfiend" });
    l.record("setItem", { instanceId: "fl", holds: { creature: "creature:dao", name: "Dao" } });
    l.record("summon", { spell: "summon:iron-flask", group: "g", creatures: [{ creature: "creature:dao", count: 1 }] });
    l.record("setItem", { instanceId: "fl", holds: null });
    expect(l.character.summons.map((m) => m.creature)).toEqual(["creature:dao"]);
    expect(l.character.inventory[0]!.holds).toBeUndefined();
  });
});

describe("24f: Aleriasa (homebrew disease)", () => {
  const mk = (cls = "class:wizard", level = 5) => {
    const c = newCharacter({ id: "al", name: "Al", race: "race:high-elf", class: cls, abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 10, cha: 10 } }, reg);
    c.classes = [{ class: cls, level }];
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("its own exhaustion adds to yours; blinded at 5", () => {
    const l = mk();
    const walk = derive(l.character, reg).speed.total;
    l.record("addEffect", { instanceId: "al", effect: "other:aleriasa" });
    l.record("updateEffect", { instanceId: "al", exhaustion: 2 });
    let s = derive(l.character, reg);
    expect(s.speed.total).toBe(Math.floor(walk / 2));
    l.record("updateEffect", { instanceId: "al", exhaustion: 5 });
    s = derive(l.character, reg);
    expect(s.effects.find((e) => e.instanceId === "al")!.includes.map((x) => x.id)).toContain("condition:blinded");
  });
  it("an ordinary cure only suppresses it: its exhaustion goes quiet for 5 days", () => {
    const l = mk();
    const walk = derive(l.character, reg).speed.total;
    l.record("addEffect", { instanceId: "al", effect: "other:aleriasa" });
    l.record("updateEffect", { instanceId: "al", exhaustion: 3 });
    l.record("addEffect", { instanceId: "lr", effect: "effect:lesser-restoration", choice: "A disease" });
    expect(l.character.effects.some((e) => e.id === "al")).toBe(true);
    const s = derive(l.character, reg);
    expect(s.effects.find((e) => e.instanceId === "al")!.suppressed).toBe(true);
    expect(s.speed.total).toBe(walk);
    l.record("passTime", { minutes: 7200 });
    expect(derive(l.character, reg).speed.total).toBe(Math.floor(walk / 2));
  });
  it("Divine Health holds it back", () => {
    const l = mk("class:paladin", 3);
    l.record("addEffect", { instanceId: "al", effect: "other:aleriasa" });
    l.record("updateEffect", { instanceId: "al", exhaustion: 2 });
    expect(derive(l.character, reg).effects.find((e) => e.instanceId === "al")!.suppressed).toBe(true);
  });
});
