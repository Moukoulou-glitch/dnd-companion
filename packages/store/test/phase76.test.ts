import { describe, expect, it } from "vitest";
import { newCharacter, summonBlock } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_813_000_000_000;
const heammer = (level: number) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: "class:druid", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 18, cha: 10 } }, reg);
  c.classes = [{ class: "class:druid", level, subclass: "subclass:circle-of-the-heammer" }];
  c.hp = { current: 40, temp: 0 };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("Circle of the Heammer in play", () => {
  it("Floar: spends a Wild Shape use, its tag carries the switch for 10 minutes, and goes with it", () => {
    const l = heammer(2);
    l.record("useAction", { action: "floar", choice: "Radiant" });
    const tag = l.character.effects.find((e) => e.effect === "other:floar")!;
    expect(tag).toMatchObject({ choice: "Radiant", minutes: 10, toggles: ["floar"] });
    expect(l.character.toggles).toContain("floar");
    expect(l.character.resourcesUsed["wild-shape"]).toBe(1);
    l.record("removeEffect", { instanceId: tag.id });
    expect(l.character.toggles).not.toContain("floar");
  });
  it("Theros: the reminder only for Plant Growth over 8 hours", () => {
    const l = heammer(10);
    const cast = (castingTime: string) => l.record("castSpell", { spell: "spell:plant-growth", list: "druid", level: 3, using: "slot", castingTime }).join(" ");
    expect(cast("8 hours")).toMatch(/Theros: you can invoke a phenomenon now/);
    expect(cast("1 action")).not.toMatch(/Theros/);
  });
  it("the Heammer Wisps: a feature's summons, named by the summon itself", () => {
    const l = heammer(10);
    l.record("summon", { spell: "summon:heammer-wisps", group: "g", creatures: [{ creature: "creature:heammer-wisp", count: 5 }] });
    expect(l.character.summons.filter((m) => m.creature === "creature:heammer-wisp")).toHaveLength(5);
    expect(l.character.summons[0]!.hp).toBe(40);
  });
});

describe("Circle of the Heammer: 15c", () => {
  it("Theros: the phenomenon and its 1d10 days go on the tag (days × 24 hours)", () => {
    const l = heammer(10);
    expect(l.record("useAction", { action: "theros", choice: "Fair Weather", rolled: 7 })).toContain("Theros: Fair Weather, 7 days.");
    expect(l.character.effects.find((e) => e.effect === "other:theros")).toMatchObject({ choice: "Fair Weather", minutes: 7 * 1440 });
    expect(l.character.resourcesUsed["theros"]).toBe(1);
  });
  it("Give Life: you regain the roll at 0 HP, the wisp loses as much from its current and maximum HP, its bonus action and the recharge are marked", () => {
    const l = heammer(10);
    l.record("summon", { spell: "summon:heammer-wisps", group: "g", creatures: [{ creature: "creature:heammer-wisp", count: 1 }] });
    const w = l.character.summons[0]!;
    expect(summonBlock(reg, w)?.actions.find((a) => a.name.startsWith("Give Life"))?.lifeTransfer).toEqual({ dice: "3d6" });
    l.record("summonConcentration", { id: w.id, spell: "Invisibility" });
    l.record("damage", { amount: 40 });
    expect(l.character.hp.current).toBe(0);
    const notes = l.record("giveLife", { summon: w.id, action: "Give Life (Recharge 6) (bonus action)", amount: 12, target: "me" }).join(" ");
    expect(l.character.hp.current).toBe(12);
    const after = l.character.summons[0]!;
    expect(after).toMatchObject({ hp: 28, maxHpAdjust: { reduce: 12, increase: 0 }, recharge: ["Give Life (Recharge 6) (bonus action)"] });
    expect(after.used?.bonus).toBe(true);
    expect(after.concentrating).toBeUndefined();
    expect(notes).toMatch(/28 of 28 HP/);
    // A second one on someone you don't track: the maximum keeps dropping.
    l.record("giveLife", { summon: w.id, action: "Give Life (Recharge 6) (bonus action)", amount: 30, targetName: "Mira" });
    expect(l.character.summons[0]).toMatchObject({ hp: 0, maxHpAdjust: { reduce: 42 } });
  });
});
