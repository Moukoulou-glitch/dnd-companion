import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_792_000_000_000;
const mk = (cls: string, level: number, sub?: string) => {
  const c = newCharacter({ id: "x", name: "X", race: "race:human", class: cls, abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 14, cha: 16 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, ...(sub ? { subclass: sub } : {}) };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("Sacred Weapon, Harness Divine Power, proficiency by hand, feats", () => {
  it("Sacred Weapon is a tick-box on attacks while it's on", () => {
    const l = mk("class:paladin", 3, "subclass:devotion");
    l.character.inventory.push({ id: "w", item: "item:longsword", quantity: 1, equipped: true, attuned: false });
    l.record("toggle", { name: "sacred-weapon", on: true });
    const atk = derive(l.character, reg).attacks.find((a) => a.itemInstanceId === "w")!;
    expect(atk.attack.parts.some((p) => p.label === "Sacred Weapon")).toBe(false);
    expect(atk.attack.suggestions.some((x) => x.label === "Sacred Weapon")).toBe(true);
  });
  it("Harness Divine Power restores the slot you pick", () => {
    const l = mk("class:cleric", 5);
    l.record("spendSlot", { level: 2 });
    const a = derive(l.character, reg).actions.find((x) => x.id === "harness-divine-power")!;
    expect(a.choose?.options).toEqual(["Level 2 slot"]);
    l.record("useAction", { action: "harness-divine-power", choice: "Level 2 slot" });
    expect(l.character.slotsUsed["2"] ?? 0).toBe(0);
    expect(l.character.resourcesUsed["harness-divine-power"]).toBe(1);
  });
  it("the proficiency bonus can be raised and lowered by hand", () => {
    const l = mk("class:fighter", 5);
    l.record("setPbAdjust", { bonus: 2, penalty: 1, note: "Boon" });
    const s = derive(l.character, reg);
    expect(s.proficiencyBonus).toBe(4);
    expect(s.proficiencyBreakdown.parts.map((p) => p.value)).toEqual([3, 2, -1]);
  });
  it("Heavy Armor Master, Defensive Duelist, Magic Initiate for every class", () => {
    const l = mk("class:fighter", 4);
    l.character.inventory.push({ id: "a", item: "item:plate-armor", quantity: 1, equipped: true, attuned: false });
    l.character.extras.push({ id: "h", kind: "feat", value: "feat:heavy-armor-master", tag: "DM allows", reason: "" }, { id: "d", kind: "feat", value: "feat:defensive-duelist", tag: "DM allows", reason: "" });
    l.record("setMaxHpAdjust", { increase: 40 });
    l.record("setHp", { current: 40 });
    const before = l.character.hp.current;
    l.record("damage", { amount: 10, damageType: "slashing" });
    expect(l.character.hp.current).toBe(before - 7);
    l.record("damage", { amount: 10, damageType: "slashing", magical: true });
    expect(l.character.hp.current).toBe(before - 17);
    expect(derive(l.character, reg).actions.find((x) => x.id === "defensive-duelist")?.note).toMatch(/^\+3 AC/);
    expect(reg.find("feat:magic-initiate", "feat")?.choices?.[0]?.from).toHaveLength(6);
  });
  it("material components are counted and used up one at a time", () => {
    const l = mk("class:cleric", 5);
    l.record("setComponent", { spell: "spell:revivify", count: 2 });
    expect(l.character.components["spell:revivify"]).toBe(2);
  });
  it("Protection from Evil and Good has its own effect", () => {
    expect(reg.find("effect:protection-from-evil-and-good", "effect")?.concentration).toBe(true);
  });
});
