import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_793_000_000_000;
const bm = () => {
  const c = newCharacter({ id: "f", name: "F", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 5, subclass: "subclass:battle-master" };
  c.choices["feature:battle-master-combat-superiority"] = { maneuvers: ["Precision Attack", "Trip Attack", "Ambush", "Bait and Switch", "Riposte"] };
  c.inventory.push({ id: "w", item: "item:shortsword", quantity: 1, equipped: true, attuned: false });
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("Maneuvers, smites, defenses, identity", () => {
  it("each maneuver shows up where it's used, with its die, DC and pool", () => {
    const s = derive(bm().character, reg);
    const atk = s.attacks.find((a) => a.itemInstanceId === "w")!;
    const pa = atk.attack.suggestions.find((x) => x.label === "Precision Attack")!;
    expect(pa).toMatchObject({ spends: { resource: "superiority-dice", amount: 1 }, group: "maneuver", apply: { dice: ["1d8"] } });
    const trip = atk.damage.bonus.suggestions.find((x) => x.label === "Trip Attack")!;
    // DC 8 + 3 + Strength +3 (human 17).
    expect(trip.reason).toMatch(/Strength save DC 14/);
    expect(atk.damage.bonus.suggestions.find((x) => x.label === "Riposte")?.preset).toBe("reaction");
    expect(s.skills.stealth.suggestions.some((x) => x.label === "Ambush")).toBe(true);
    expect(s.initiative.suggestions.some((x) => x.label === "Ambush")).toBe(true);
    expect(atk.damage.bonus.suggestions.some((x) => x.label === "Maneuver damage")).toBe(false);
  });
  it("Bait and Switch adds the die to AC until your next turn", () => {
    const l = bm();
    const ac = derive(l.character, reg).ac.total;
    l.record("useAction", { action: "maneuver-bait-and-switch", rolled: 5 });
    expect(derive(l.character, reg).ac.total).toBe(ac + 5);
  });
  it("a smite waits for the next melee hit: ticked, with its DC, and used up by that hit", () => {
    const c = newCharacter({ id: "p", name: "P", race: "race:human", class: "class:paladin", abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 16 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 5 };
    c.inventory.push({ id: "w", item: "item:longsword", quantity: 1, equipped: true, attuned: false });
    c.effects.push({ id: "sm", effect: "effect:thunderous-smite", concentration: true } as never);
    const atk = derive(c, reg).attacks.find((a) => a.itemInstanceId === "w")!;
    const sg = atk.damage.bonus.suggestions.find((x) => x.label === "Thunderous Smite")!;
    expect(sg).toMatchObject({ preset: "always", endsEffect: "sm", apply: { dice: ["2d6"], damageType: "thunder" } });
    expect(sg.reason).toMatch(/Strength save against DC 14/);
  });
  it("resistances, immunities and vulnerabilities by hand; size and creature type", () => {
    const l = bm();
    l.record("setDefense", { kind: "resist", value: "fire", on: true });
    l.record("setDefense", { kind: "immune", value: "frightened", on: true });
    const s = derive(l.character, reg);
    expect(s.defenses.resist).toContain("fire");
    expect(l.record("addEffect", { instanceId: "fr", effect: "condition:frightened" }).join(" ")).toMatch(/immune to being frightened/);
    const before = l.character.hp.current;
    l.record("damage", { amount: 10, damageType: "fire" });
    expect(l.character.hp.current).toBe(before - 5);
    l.record("setDetails", { size: "large", creatureType: "fey" });
    expect(l.character).toMatchObject({ size: "large", creatureType: "fey" });
  });
});
