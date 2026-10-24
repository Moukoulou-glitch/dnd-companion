import { describe, expect, it } from "vitest";
import { derive, newCharacter, shapeIssues } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_800_000_000_000;
const make = (cls: string, level: number, extra: (c: ReturnType<typeof newCharacter>) => void = () => {}) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: cls, abilities: { str: 14, dex: 14, con: 14, int: 16, wis: 16, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level };
  c.inventory.push({ id: "ls", item: "item:longsword", quantity: 1, equipped: true, attuned: false });
  extra(c);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const withEffect = (effect: string, choice?: string) => derive(make("class:fighter", 5, (c) => c.effects.push({ id: "e", effect, ...(choice ? { choice } : {}), rounds: 10 })).character, reg);

describe("11d: spells with mechanics", () => {
  it("Enlarge and Reduce on yourself", () => {
    const big = withEffect("effect:enlarge-reduce", "Enlarge");
    expect(big.skills.athletics.advantage).toContain("Enlarge");
    expect(big.saves.str.advantage).toContain("Enlarge");
    expect(big.attacks.find((a) => a.name === "Longsword")!.damage.bonus.dice).toContainEqual(expect.objectContaining({ dice: "1d4" }));
    const small = withEffect("effect:enlarge-reduce", "Reduce");
    expect(small.saves.str.disadvantage).toContain("Reduce");
    expect(small.attacks.find((a) => a.name === "Longsword")!.damage.bonus.dice).toContainEqual(expect.objectContaining({ dice: "-1d4" }));
    expect(small.saves.str.advantage).not.toContain("Enlarge");
  });
  it("Beacon of Hope, Wind Walk's cloud form, Ray of Enfeeblement's note", () => {
    expect(withEffect("effect:beacon-of-hope").saves.wis.advantage).toContain("Beacon of Hope");
    expect(withEffect("effect:wind-walk", "Cloud form").speeds.find((s) => s.mode === "fly")?.total.total).toBe(300);
    expect(withEffect("effect:wind-walk", "Normal form").speeds.find((s) => s.mode === "fly")).toBeUndefined();
    expect(withEffect("effect:ray-of-enfeeblement").attacks[0]!.damage.bonus.notes?.join(" ")).toMatch(/half damage/);
  });
  it("Blindness/Deafness brings the condition picked", () => {
    const s = withEffect("effect:blindness-deafness", "Blinded");
    expect(s.effects.find((e) => e.id === "effect:blindness-deafness")?.includes.map((x) => x.id)).toEqual(["condition:blinded"]);
    expect(s.attacks[0]!.attack.disadvantage.length).toBeGreaterThan(0);
    expect(withEffect("effect:blindness-deafness", "Deafened").attacks[0]!.attack.disadvantage.length).toBe(0);
  });
  it("Sanctuary, Feather Fall, Water Walk, Water Breathing, Etherealness have tags with their time", () => {
    for (const [id, rounds, minutes] of [["sanctuary", 10, undefined], ["feather-fall", 10, undefined], ["water-walk", undefined, 60], ["water-breathing", undefined, 1440], ["etherealness", undefined, 480]] as const) {
      const d = reg.find(`effect:${id}`, "effect")!;
      expect([d.rounds, d.minutes]).toEqual([rounds, minutes]);
    }
    expect(reg.find("effect:sanctuary", "effect")?.endsOn).toEqual(["attack", "cast"]);
  });
  it("Animal Shapes: a beast up to CR 4, keeping your mind", () => {
    const wolf = reg.find("creature:wolf", "creature")!;
    expect(shapeIssues(wolf, "animalshapes", undefined, 4)).toEqual([]);
    const l = make("class:druid", 15);
    l.record("transform", { kind: "animalshapes", creature: "creature:wolf" });
    const s = derive(l.character, reg);
    expect(s.shape?.abilities.wis.score).toBe(s.abilities.wis.score.total);
    expect(s.shape?.abilities.wis.mine).toBe(true);
    expect(s.shape?.abilities.str.mine).toBe(false);
  });
});

describe("11d: a tag for every spell with a duration you cast", () => {
  it("on another creature, until dispelled; concentration spells use the concentration tag", () => {
    const l = make("class:wizard", 9, (c) => {
      c.spells.push({ spell: "spell:arcane-lock", list: "wizard", prepared: true }, { spell: "spell:enlarge-reduce", list: "wizard", prepared: true }, { spell: "spell:feather-fall", list: "wizard", prepared: true });
    });
    l.record("castSpell", { spell: "spell:feather-fall", list: "wizard", level: 1, using: "slot", selfEffect: false });
    expect(l.character.effects.find((e) => e.custom?.name === "Feather Fall (on another creature)")?.rounds).toBe(10);
    l.record("castSpell", { spell: "spell:arcane-lock", list: "wizard", level: 2, using: "slot" });
    const lock = l.character.effects.find((e) => e.custom?.name === "Arcane Lock")!;
    expect(lock.rounds ?? lock.minutes).toBeUndefined();
    l.record("castSpell", { spell: "spell:enlarge-reduce", list: "wizard", level: 2, using: "slot", selfEffect: false });
    expect(l.character.concentration?.name).toBe("Enlarge/Reduce");
    expect(l.character.effects.some((e) => e.custom?.name?.startsWith("Enlarge/Reduce"))).toBe(false);
  });
});
