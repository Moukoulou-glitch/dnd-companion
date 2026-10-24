import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { composeD20, rollComposed } from "@dnd/dice";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_801_000_000_000;
const make = (track: boolean, extra: (c: ReturnType<typeof newCharacter>) => void = () => {}) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: "class:fighter", abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 12, cha: 10 } }, reg);
  c.inventory.push({ id: "bow", item: "item:longbow", quantity: 1, equipped: true, attuned: false }, { id: "arr", item: "item:arrows", quantity: 20, equipped: false, attuned: false }, { id: "bolts", item: "item:crossbow-bolt", quantity: 10, equipped: false, attuned: false });
  if (track) c.settings.trackAmmo = true;
  extra(c);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const bowOf = (l: CharacterLog) => derive(l.character, reg).attacks.find((a) => a.name === "Longbow")!;

describe("11e-2: ammunition", () => {
  it("a bow lists the arrows you carry (not the bolts); tracked, the first starts ticked", () => {
    const bow = bowOf(make(true));
    expect(bow.ammo?.map((a) => a.instanceId)).toEqual(["arr"]);
    const sg = bow.attack.suggestions.find((s) => s.ammo === "arr")!;
    expect(sg).toMatchObject({ group: "ammunition", preset: "always" });
    expect(bow.damage.bonus.suggestions.some((s) => s.ammo === "arr")).toBe(true);
    // Not tracked: plain arrows aren't an option (nothing to change), but the bow still knows them.
    const off = bowOf(make(false));
    expect(off.ammo?.length).toBe(1);
    expect(off.attack.suggestions.some((s) => s.ammo)).toBe(false);
  });
  it("magic ammunition of your own: its bonus on attack and damage, its changes only on that roll", () => {
    const l = make(false, (c) => {
      c.customItems.push({ id: "fa", name: "Fire Arrows", category: "ammunition", description: "", requiresAttunement: false, source: "", ammoFor: ["longbow"], bonus: 1, modifiers: [{ selector: "roll.damage.weapon.*", op: "add", value: "1d6", mode: "auto", label: "Fire Arrows" }] });
      c.inventory.push({ id: "fai", item: "item:custom-fa", quantity: 5, equipped: true, attuned: false });
    });
    const bow = bowOf(l);
    const atk = bow.attack.suggestions.find((s) => s.ammo === "fai")!;
    expect(atk.apply.flat).toBe(1);
    const dmg = bow.damage.bonus.suggestions.find((s) => s.ammo === "fai")!;
    expect(dmg.apply).toMatchObject({ flat: 1, dice: ["1d6"] });
    // Equipped, its changes still don't go on everything.
    expect(bow.damage.bonus.dice.some((d) => d.label === "Fire Arrows")).toBe(false);
    const r = rollComposed(composeD20(bow.attack, { enabled: ["Fire Arrows"], manual: "none", extra: 0 }), [10]);
    expect(r.result.total).toBe(10 + bow.attack.total + 1);
  });
  it("shooting counts down and is remembered; after the fight, half can be picked up", () => {
    const l = make(true);
    l.record("startCombat", {});
    for (let i = 0; i < 5; i++) l.record("useAmmo", { instanceId: "arr" });
    expect(l.character.inventory.find((i) => i.id === "arr")?.quantity).toBe(15);
    l.record("endCombat", {});
    expect(l.lastPrompts.some((p) => p.kind === "ammo")).toBe(true);
    l.record("recoverAmmo", { items: [{ instanceId: "arr", amount: 2 }] });
    expect(l.character.inventory.find((i) => i.id === "arr")?.quantity).toBe(17);
    expect(l.character.ammoSpent).toBeUndefined();
  });
});

describe("11e-2: your own weapon, and weapon properties", () => {
  it("a weapon made from a longsword keeps its group (proficiency) and takes its properties", () => {
    const l = make(false, (c) => {
      c.customItems.push({ id: "w", name: "Dawnblade", category: "weapon", description: "", requiresAttunement: false, source: "", modifiers: [], bonus: 1, weapon: { base: "item:longsword", category: "martial", kind: "melee", damage: "1d8", damageType: "slashing", versatileDamage: "1d10", properties: ["versatile", "finesse"] } });
      c.inventory.push({ id: "wi", item: "item:custom-w", quantity: 1, equipped: true, attuned: false });
    });
    const s = derive(l.character, reg);
    const w = s.attacks.find((a) => a.name === "Dawnblade")!;
    expect(w.proficient).toBe(true);
    expect(w.ability).toBe("dex");
    expect(w.damage.versatileDice).toBe("1d10");
    expect(w.attack.parts.some((p) => p.label === "Magic weapon" && p.value === 1)).toBe(true);
  });
  it("long range, Loading and Heavy for a Small creature", () => {
    const l = make(false, (c) => {
      c.race = "race:lightfoot-halfling";
      c.inventory.push({ id: "hc", item: "item:heavy-crossbow", quantity: 1, equipped: true, attuned: false });
    });
    const hc = derive(l.character, reg).attacks.find((a) => a.name === "Crossbow, heavy" || a.attackId === "item:heavy-crossbow")!;
    expect(hc.attack.disadvantage).toContain("Heavy weapon, Small creature");
    expect(hc.attack.notes?.join(" ")).toMatch(/Loading/);
    expect(hc.attack.suggestions.find((s) => s.label === "Long range")?.reason).toMatch(/beyond 100 ft/);
  });
});
