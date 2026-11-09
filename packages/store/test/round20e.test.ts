import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_870_000_000_000;
const holding = (item: string, picks?: string[]) => {
  const c = newCharacter({ id: "f", name: "F", race: "race:high-elf", class: "class:fighter", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
  c.classes = [{ class: "class:fighter", level: 5 }];
  c.hp = { current: 44, temp: 0 };
  c.inventory.push({ id: "w", item, quantity: 1, equipped: true, attuned: true, ...(picks ? { picks } : {}) } as never);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const sheet = (l: CharacterLog) => derive(l.character, reg);
const own = (l: CharacterLog) => sheet(l).attacks.find((a) => a.itemInstanceId === "w" && a.mode === "melee" && !a.offHand)!;
const hit = (l: CharacterLog) => own(l).attack.total;
const dmg = (l: CharacterLog) => own(l).damage.bonus.total;

describe("20e: Defender", () => {
  it("a +3 sword; moving 2 to AC: +1 to hit and damage, +2 AC, until the start of your next turn", () => {
    const l = holding("item:defender-longsword");
    const [h, d, ac] = [hit(l), dmg(l), sheet(l).ac.total];
    expect(own(l).attack.parts.find((p) => p.label === "Magic weapon")?.value).toBe(3);
    l.record("startCombat", {} as never);
    l.record("useAction", { action: "defender-shift", choice: "+2 to AC" });
    expect([hit(l), dmg(l), sheet(l).ac.total]).toEqual([h - 2, d - 2, ac + 2]);
    // Changed its mind before the attack: +3 instead, not both.
    l.record("useAction", { action: "defender-shift", choice: "+3 to AC" });
    expect([hit(l), dmg(l), sheet(l).ac.total]).toEqual([h - 3, d - 3, ac + 3]);
    // The same pick twice stays on.
    l.record("useAction", { action: "defender-shift", choice: "+3 to AC" });
    expect(sheet(l).ac.total).toBe(ac + 3);
    l.record("startTurn", {} as never);
    expect([hit(l), dmg(l), sheet(l).ac.total]).toEqual([h, d, ac]);
  });
  it("only while held: unequipped, no AC", () => {
    const l = holding("item:defender-longsword");
    const ac = sheet(l).ac.total;
    l.record("useAction", { action: "defender-shift", choice: "+1 to AC" });
    expect(sheet(l).ac.total).toBe(ac + 1);
    l.character.inventory[0]!.equipped = false;
    expect(sheet(l).ac.total).toBe(ac);
  });
  it("the Moonblade's defender rune does the same with its bonus", () => {
    const l = holding("item:moonblade", ["bonus", "defender"]);
    const [h, ac] = [hit(l), sheet(l).ac.total];
    l.record("useAction", { action: "moonblade-defender-shift", choice: "+2 to AC" });
    expect([hit(l), sheet(l).ac.total]).toEqual([h - 2, ac + 2]);
  });
});
