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
