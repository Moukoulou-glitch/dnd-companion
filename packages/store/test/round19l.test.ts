import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_870_000_000_000;
const pc = (cls: string, level: number, items: { item: string; picks?: string[] }[], abilities = { str: 10, dex: 16, con: 14, int: 12, wis: 16, cha: 14 }) => {
  const c = newCharacter({ id: "p", name: "P", race: "race:human", class: cls, abilities }, reg);
  c.classes = [{ class: cls, level }];
  c.hp = { current: 30, temp: 0 };
  items.forEach((x, i) => c.inventory.push({ id: `i${i}`, item: x.item, quantity: 1, equipped: true, attuned: true, ...(x.picks ? { picks: x.picks } : {}) } as never));
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const sheet = (l: CharacterLog) => derive(l.character, reg);

describe("19l: homebrew items", () => {
  it("every one is in the app, with the table's text", () => {
    for (const id of ["tome-of-wound-forbidding", "tattoo-of-vineyard-blessing", "tattoo-of-illusionary-scribing", "tattoo-of-guardian-winds", "tattoo-of-werewolfs-bane", "ring-of-the-great-pine-cone", "tattoo-of-last-hope", "feathertide", "cloak-of-nightclaw", "cloak-of-cychron", "afternight", "tattoo-of-empowered-essence", "staff-of-the-tinker", "pearl-of-regeneration", "tattoo-of-unlocking"]) {
      const d = reg.find(`item:${id}`, "item");
      expect(d, id).toBeTruthy();
      expect(d!.text?.length, id).toBeGreaterThan(0);
    }
  });
  it("Tome of Wound Forbidding: studied, healing spells and class features give your proficiency bonus more", () => {
    const l = pc("class:cleric", 5, [{ item: "item:tome-of-wound-forbidding" }]);
    // As the app does: the item used, then its effect on you.
    l.record("useItem", { instanceId: "i0" });
    l.record("addEffect", { instanceId: "tome", effect: "effect:tome-of-wound-forbidding" });
    const s = sheet(l);
    expect(l.character.effects.some((e) => e.effect === "effect:tome-of-wound-forbidding")).toBe(true);
    const cw = s.spells.find((x) => x.id === "spell:cure-wounds");
    expect(cw!.heal!.bonus![1]!.some((b) => b.label === "Tome of Wound Forbidding" && b.value === 3)).toBe(true);
    // A paladin's Lay on Hands: 3 more.
    const p = pc("class:paladin", 5, [{ item: "item:tome-of-wound-forbidding" }]);
    p.record("addEffect", { instanceId: "tome", effect: "effect:tome-of-wound-forbidding" });
    expect(sheet(p).actions.find((a) => a.id === "lay-on-hands")?.healBonus).toMatchObject({ value: 3 });
    // 30 hit points: 5 from Lay on Hands and 3 from the tome.
    expect(p.record("useAction", { action: "lay-on-hands", amount: 5, healSelf: true }).join(" ")).toMatch(/Tome of Wound Forbidding: \+3/);
    expect(p.character.hp.current).toBe(38);
  });
  it("Vineyard Blessing: level + Con temporary HP and poison resistance while they last", () => {
    const l = pc("class:fighter", 5, [{ item: "item:tattoo-of-vineyard-blessing" }]);
    const a = sheet(l).actions.find((x) => x.id === "tattoo-vineyard")!;
    expect(a.tempHp?.flat).toBe(7);
    l.record("useAction", { action: "tattoo-vineyard", rolled: 7 });
    expect(sheet(l).defenses.resist).toContain("poison");
    l.record("damage", { amount: 7 });
    expect(sheet(l).defenses.resist).not.toContain("poison");
  });
  it("Guardian Winds: resistance to ranged weapon attacks while on", () => {
    const l = pc("class:fighter", 5, [{ item: "item:tattoo-of-guardian-winds" }]);
    l.record("useAction", { action: "tattoo-guardian-winds" });
    expect(l.record("damage", { amount: 10, ranged: true }).join(" ")).toMatch(/ranged weapon attacks: 10 halved to 5/);
    expect(l.character.hp.current).toBe(25);
    l.record("damage", { amount: 10 });
    expect(l.character.hp.current).toBe(15);
  });
  it("Last Hope: once a dawn you drop to your Charisma modifier instead of 0", () => {
    const l = pc("class:sorcerer", 6, [{ item: "item:tattoo-of-last-hope" }], { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 18 });
    expect(l.record("damage", { amount: 40 }).join(" ")).toMatch(/drop to 4 hit points instead.*gain 10 temporary hit points/);
    expect(l.character.hp.current).toBe(4);
    l.record("damage", { amount: 10 });
    expect(l.character.hp.current).toBe(0);
  });
  it("Ring of the Great Pine Cone: at-will spells with its ability; charges for its spells and properties; Whisperer's immunity", () => {
    const l = pc("class:fighter", 5, [{ item: "item:ring-of-the-great-pine-cone", picks: ["wis"] }]);
    const s = sheet(l);
    expect(s.spells.some((x) => x.id === "spell:shillelagh")).toBe(true);
    const w = s.actions.find((x) => x.id === "pine-cone-whisperer")!;
    expect(w.charges).toMatchObject({ amount: 5, remaining: 6 });
    l.record("useAction", { action: "pine-cone-whisperer", choice: "fire" });
    expect(l.character.inventory[0]!.chargesUsed).toBe(5);
    expect(sheet(l).defenses.immune).toContain("fire");
    expect(l.record("useAction", { action: "pine-cone-embrace" }).join(" ")).toMatch(/only 1 charge left/);
  });
  it("Feathertide: +1, Dex +1, 10 ft speed, its two features by proficiency bonus", () => {
    const l = pc("class:rogue", 5, [{ item: "item:feathertide" }]);
    const s = sheet(l);
    expect(s.saves.dex.parts.some((p) => p.label === "Feathertide")).toBe(true);
    expect(s.speed.total).toBe(40);
    expect(s.resources.find((r) => r.id === "feathertide-swift")?.max).toBe(3);
  });
  it("Cloak of Nightclaw: cold resistance, 1d6 cold on weapon attacks, a note on a critical hit", () => {
    const l = pc("class:fighter", 5, [{ item: "item:cloak-of-nightclaw" }, { item: "item:longsword" }]);
    const s = sheet(l);
    expect(s.defenses.resist).toContain("cold");
    const a = s.attacks.find((x) => x.itemInstanceId === "i1" && !x.offHand)!;
    expect(a.damage.bonus.dice).toEqual(expect.arrayContaining([expect.objectContaining({ dice: "1d6", damageType: "cold" })]));
    expect(a.damage.critRiders).toContainEqual(expect.objectContaining({ anyCrit: true, label: "Cloak of Nightclaw" }));
  });
  it("Staff of the Tinker, Unlocking, Empowered Essence, Pearl, Werewolf's Bane, Afternight", () => {
    const w = sheet(pc("class:wizard", 5, [{ item: "item:staff-of-the-tinker" }, { item: "item:tattoo-of-unlocking" }, { item: "item:tattoo-of-empowered-essence" }, { item: "item:pearl-of-regeneration" }, { item: "item:tattoo-of-werewolfs-bane" }, { item: "item:afternight" }]));
    expect(w.spells.some((x) => x.id === "spell:mending")).toBe(true);
    expect(w.actions.find((x) => x.id === "tinker-reality")?.charges?.amount).toBe(4);
    expect(w.resources.find((r) => r.id === "tattoo-unlocking")?.max).toBe(3);
    expect(w.spells.some((x) => x.id === "spell:enhance-ability")).toBe(true);
    expect(w.actions.find((x) => x.id === "pearl-hour")?.heal?.flat).toBe(15);
    expect(w.actions.find((x) => x.id === "tattoo-werewolf")?.roll?.flat).toBe(5);
    expect(w.attacks.some((a) => a.attackId === "item:afternight")).toBe(true);
  });
});
