import { describe, expect, it } from "vitest";
import { derive, newCharacter, summonBlock } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 2_000_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
const druid = () => {
  const c = newCharacter({ id: "d", name: "Yoyo", race: "race:dragonborn", class: "class:druid", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 8 };
  c.hp.current = derive(c, reg).hpMax.total;
  return logOf(c);
};

describe("effects on summoned creatures, movement, form speed", () => {
  it("effects come off by instance; Aid raises and lowers hit points; Bless, Poisoned and Bardic Inspiration reach its rolls", () => {
    const log = druid();
    log.record("summon", { spell: "spell:conjure-minor-elementals", group: "g", creatures: [{ creature: "creature:gargoyle", count: 1 }] });
    const id = log.character.summons[0]!.id;
    log.record("summonEffect", { id, effect: "condition:incapacitated", add: true });
    const inst = log.character.summons[0]!.effects![0]!.id;
    (log.record("summonEffect", { id, effect: "condition:incapacitated", instance: inst, add: false }));
    expect(log.character.summons[0]!.effects).toEqual([]);

    log.record("summonEffect", { id, effect: "effect:aid", add: true });
    expect(log.character.summons[0]!.hp).toBe(57);
    let b = summonBlock(reg, log.character.summons[0]!)!;
    expect(b.hp).toEqual({ current: 57, max: 57 });
    log.record("summonEffect", { id, effect: "effect:bless", add: true, rounds: 10 });
    log.record("summonEffect", { id, effect: "condition:poisoned", add: true });
    log.record("summonEffect", { id, effect: "other:bardic-inspiration", add: true, choice: "d8" });
    b = summonBlock(reg, log.character.summons[0]!)!;
    const bite = b.attacks.find((a) => a.name === "Bite")!;
    expect(bite.attack.dice.map((d) => d.dice)).toEqual(["1d4"]);
    expect(bite.attack.disadvantage).toEqual(["Poisoned"]);
    expect(bite.attack.suggestions.find((s) => s.label === "Bardic Inspiration")!.apply.dice).toEqual(["1d8"]);
    expect(b.saves.wis.dice.map((d) => d.dice)).toEqual(["1d4"]);
    const aid = log.character.summons[0]!.effects!.find((e) => e.effect === "effect:aid")!;
    log.record("summonEffect", { id, effect: "effect:aid", instance: aid.id, add: false });
    expect(log.character.summons[0]!.hp).toBe(52);
  });

  it("a summoned creature moves and dashes; a form's speed is the creature's", () => {
    const log = druid();
    log.record("summon", { spell: "spell:conjure-minor-elementals", group: "g", creatures: [{ creature: "creature:gargoyle", count: 1 }] });
    const id = log.character.summons[0]!.id;
    log.record("summonEconomy", { id, move: 30 });
    expect(log.record("summonEconomy", { id, move: 40 }).join(" ")).toMatch(/beyond its 60 ft/);
    log.record("summonEconomy", { id, dash: true, kind: "action", used: true });
    expect(log.character.summons[0]!.used).toMatchObject({ moved: 70, dashes: 1, action: true });
    log.record("summonEconomy", { id, newTurn: true });
    expect(log.character.summons[0]!.used).toMatchObject({ moved: 0, dashes: 0 });
    log.record("transform", { kind: "wildshape", creature: "creature:giant-boar" });
    expect(derive(log.character, reg).speed.total).toBe(40);
  });
});
