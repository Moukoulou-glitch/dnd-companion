import { describe, expect, it } from "vitest";
import { ACTION_TARGETS, derive, friendlyTargets, newCharacter, targetWarnings } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_797_000_000_000;
const log = () => {
  const c = newCharacter({ id: "p", name: "Pell", race: "race:human", class: "class:paladin", abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 14 } }, reg);
  c.inventory.push({ id: "pot", item: "item:potion-of-healing", quantity: 2, equipped: false, attuned: false });
  c.summons.push({ id: "z1", creature: "creature:zombie", hp: 12, spell: "spell:animate-dead", group: "g1" });
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("9f: potions and features on others", () => {
  it("a potion: one fewer each time, gone at none, and it takes your action", () => {
    const l = log();
    l.record("startCombat", {});
    l.record("startTurn", {});
    expect(l.record("useItem", { instanceId: "pot" }).join(" ")).toMatch(/Potion of Healing used: 1 left/);
    expect(l.character.combat?.action).toBe(1);
    l.record("useItem", { instanceId: "pot", given: true });
    expect(l.character.inventory.some((i) => i.id === "pot")).toBe(false);
    expect(reg.find("item:potion-of-supreme-healing", "item")?.use?.heal).toEqual({ dice: "10d4", bonus: 20 });
  });
  it("Lay on Hands on an undead summoned creature is warned about; Bardic Inspiration on yourself too", () => {
    const l = log();
    const ts = friendlyTargets(l.character, derive(l.character, reg), reg);
    const zombie = ts.find((x) => x.id === "summon:z1")!;
    expect(targetWarnings(zombie, ACTION_TARGETS["lay-on-hands"], "Lay on Hands")[0]).toMatch(/no effect on undead/);
    expect(targetWarnings(ts[0]!, ACTION_TARGETS["bardic-inspiration"], "Bardic Inspiration")[0]).toMatch(/someone other than you/);
  });
});
