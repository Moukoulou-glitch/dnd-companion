import { describe, expect, it } from "vitest";
import { bookPack, derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_890_000_000_000;
const pc = (items: { item: string; picks?: string[]; quantity?: number }[]) => {
  const c = newCharacter({ id: "f", name: "F", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 16, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
  c.classes = [{ class: "class:fighter", level: 5 }];
  c.hp = { current: 44, temp: 0 };
  items.forEach((x, i) => c.inventory.push({ id: `i${i}`, item: x.item, quantity: x.quantity ?? 1, equipped: true, attuned: true, ...(x.picks ? { picks: x.picks } : {}) } as never));
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const sheet = (l: CharacterLog) => derive(l.character, reg);

describe("20b: items that didn't work", () => {
  it("manuals and tomes: +2 to a score and to its maximum, for good", () => {
    expect(reg.find("item:manual-of-gainful-exercise", "item")?.use).toMatchObject({ permanent: { ability: "str", amount: 2 }, consumed: false });
    const l = pc([{ item: "item:manual-of-gainful-exercise" }]);
    l.record("setAbilityAdjust", { ability: "str", addPermanent: { amount: 2, from: "Manual of Gainful Exercise", newMax: 22 } });
    expect(sheet(l).abilities.str.score.total).toBe(19); // 16, +1 human, +2 manual
    expect(sheet(l).abilities.str.max).toBe(22);
  });
  it("a potion of one damage type's resistance: that resistance for an hour", () => {
    expect(reg.find("item:potion-of-fire-resistance", "item")?.use).toMatchObject({ effect: "other:potion-resistance", choice: "fire" });
    const l = pc([]);
    l.record("addEffect", { instanceId: "p", effect: "other:potion-resistance", choice: "fire" });
    expect(sheet(l).defenses.resist).toContain("fire");
    l.record("addEffect", { instanceId: "q", effect: "other:potion-invulnerability" });
    expect(sheet(l).defenses.resist).toContain("all");
  });
  it("Ring of Resistance: the type picked on it", () => {
    expect(sheet(pc([{ item: "item:ring-of-resistance", picks: ["necrotic"] }])).defenses.resist).toContain("necrotic");
  });
  it("Armor of Invulnerability: nonmagical damage halved, nothing while invulnerable; magical damage in full", () => {
    const l = pc([{ item: "item:armor-of-invulnerability" }]);
    expect(sheet(l).ac.total).toBe(18);
    expect(l.record("damage", { amount: 10, damageType: "slashing" }).join(" ")).toMatch(/nonmagical damage: 10 halved to 5/);
    l.record("damage", { amount: 10, damageType: "fire", magical: true });
    expect(l.character.hp.current).toBe(29);
    l.record("useAction", { action: "armor-of-invulnerability" });
    l.record("damage", { amount: 10, damageType: "bludgeoning" });
    expect(l.character.hp.current).toBe(29);
  });
  it("Periapt of Health, Ring of Invisibility, Oathbow, Arrow of Slaying", () => {
    const s = sheet(pc([{ item: "item:periapt-of-health" }, { item: "item:ring-of-invisibility" }, { item: "item:oathbow" }, { item: "item:arrow-of-slaying", quantity: 2 }]));
    expect(s.defenses.immune).toContain("disease");
    expect(s.actions.find((a) => a.id === "ring-of-invisibility")).toBeTruthy();
    const bow = s.attacks.find((a) => a.itemInstanceId === "i2")!;
    expect(bow.attack.suggestions.some((x) => x.label === "Oathbow: sworn enemy")).toBe(true);
    expect(bow.damage.bonus.suggestions.find((x) => x.label === "Arrow of Slaying")?.apply.dice).toEqual(["6d10"]);
  });
  it("a book's +1 crossbow bolt is a +1 to the crossbow's attack and damage", () => {
    const ITEM = `#### +1 Quarrel\n\nAmmunition, Uncommon\n\n---\n\nYou have a +1 bonus to attack and damage rolls made with this piece of magic ammunition. Once it hits a target, the ammunition is no longer magical.\n`;
    const { pack } = bookPack([{ name: "items.md", text: ITEM }], reg);
    expect((pack.definitions.find((d) => d.id === "item:1-quarrel") as any).magic.bonus).toBe(1);
  });
});
