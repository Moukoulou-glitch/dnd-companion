import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_850_000_000_000;
const wizard = (opts: { guardian?: boolean; equipped?: boolean } = {}) => {
  const { guardian = true, equipped = true } = opts;
  const c = newCharacter({ id: "w", name: "Mage", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 } }, reg);
  c.classes = [{ class: "class:wizard", level: 9 }];
  c.hp = { current: 40, temp: 0 };
  c.inventory.push({ id: "am", item: "item:masters-amulet", quantity: 1, equipped, attuned: false } as any);
  if (guardian) c.customCompanions = [{ id: "g", name: "Guardian", kind: "Construct", from: "creature:shield-guardian", size: "Large", type: "construct", ac: 17, hpMax: 142, speed: "30 ft.", abilities: { str: 18, dex: 8, con: 18, int: 7, wis: 10, cha: 3 }, traits: [], attacks: [] } as any];
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const guardian = (l: CharacterLog) => derive(l.character, reg).companions.find((x) => x.custom?.from === "creature:shield-guardian")!;
const guardianHp = (l: CharacterLog) => l.character.companions[guardian(l).id]?.hp?.current ?? guardian(l).form!.hpMax.total;

describe("19f: Bound: half your damage goes to the shield guardian", () => {
  it("with the amulet worn and it within 60 ft, half (rounded up) moves to it", () => {
    const l = wizard();
    const notes = l.record("damage", { amount: 15, damageType: "slashing", bound: true }).join(" ");
    expect(notes).toMatch(/Bound: 8 of the 15 goes to Guardian; you take 7/);
    expect(l.character.hp.current).toBe(33);
    expect(guardianHp(l)).toBe(142 - 8);
  });
  it("after your resistances: the halved damage is what's split", () => {
    const l = wizard();
    l.record("addEffect", { instanceId: "x", effect: "custom", custom: { name: "Fire ward", modifiers: [{ selector: "defense.resist.fire", op: "resist", label: "Fire ward" }] } } as any);
    expect(derive(l.character, reg).defenses.resist).toContain("fire");
    l.record("damage", { amount: 20, damageType: "fire", bound: true });
    // Resistant: 20 halved to 10, then 5 to it and 5 to you.
    expect(l.character.hp.current).toBe(35);
    expect(guardianHp(l)).toBe(137);
  });
  it("its own immunities apply to its half: poison moved to it does nothing", () => {
    const l = wizard();
    l.record("damage", { amount: 10, damageType: "poison", bound: true });
    expect(l.character.hp.current).toBe(35);
    expect(guardianHp(l)).toBe(142);
  });
  it("not within 60 ft (no flag), older logs: you take it all", () => {
    const l = wizard();
    l.record("damage", { amount: 15 });
    expect(l.character.hp.current).toBe(25);
    expect(guardianHp(l)).toBe(142);
  });
  it("no amulet worn, or no guardian: says so and you take it all", () => {
    const a = wizard({ equipped: false });
    expect(a.record("damage", { amount: 10, bound: true }).join(" ")).toMatch(/don't wear Guardian's Master's Amulet/);
    expect(a.character.hp.current).toBe(30);
    const b = wizard({ guardian: false });
    expect(b.record("damage", { amount: 10, bound: true }).join(" ")).toMatch(/no shield guardian/);
    expect(b.character.hp.current).toBe(30);
  });
  it("a guardian at 0 HP takes nothing more", () => {
    const l = wizard();
    l.record("damage", { amount: 142, companion: guardian(l).id });
    expect(guardianHp(l)).toBe(0);
    expect(l.record("damage", { amount: 10, bound: true }).join(" ")).toMatch(/at 0 HP, so you take it all/);
    expect(l.character.hp.current).toBe(30);
  });
  it("concentration: the save is for the half you take", () => {
    const l = wizard();
    l.character.concentration = { spell: "spell:fly", name: "Fly" } as any;
    l.record("damage", { amount: 30, bound: true });
    expect(l.character.hp.current).toBe(25);
    // 15 taken: DC 10 (not the 15 for 30).
    expect(l.lastPrompts).toContainEqual(expect.objectContaining({ kind: "concentration", dc: 10 }));
  });
});

describe("19f: Shield: +2 AC from the guardian's reaction", () => {
  it("gives you +2 AC and uses its reaction; a second one the same round warns", () => {
    const l = wizard();
    const ac = derive(l.character, reg).ac.total;
    const id = guardian(l).id;
    expect(l.record("guardianShield", { companion: id }).join(" ")).toMatch(/\+2 AC against this attack/);
    expect(derive(l.character, reg).ac.total).toBe(ac + 2);
    expect(guardian(l).used.reaction).toBe(true);
    expect(l.record("guardianShield", { companion: id }).join(" ")).toMatch(/reaction is already used.*already on you/);
    expect(l.character.effects.filter((e) => e.effect === "effect:guardian-shield")).toHaveLength(1);
  });
  it("ends when your next turn starts; its reaction comes back on its turn", () => {
    const l = wizard();
    const id = guardian(l).id;
    l.record("startCombat", {});
    l.record("guardianShield", { companion: id });
    l.record("startTurn", {});
    expect(l.character.effects.some((e) => e.effect === "effect:guardian-shield")).toBe(false);
    l.record("companionEconomy", { companion: id, newTurn: true });
    expect(guardian(l).used.reaction).toBe(false);
  });
  it("without the amulet worn it warns, and still applies (warn, never block)", () => {
    const l = wizard({ equipped: false });
    expect(l.record("guardianShield", { companion: guardian(l).id }).join(" ")).toMatch(/don't wear Guardian's Master's Amulet/);
    expect(l.character.effects.some((e) => e.effect === "effect:guardian-shield")).toBe(true);
  });
});
