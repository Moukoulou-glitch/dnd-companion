import { describe, expect, it } from "vitest";
import { creatureBlock, derive, newCharacter, traitDice } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 1_800_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
const sheetOf = (log: CharacterLog) => derive(log.character, reg);
const druid = (level: number) => {
  const c = newCharacter({ id: "d", name: "Yoyo", race: "race:dragonborn", class: "class:druid", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level };
  c.hp.current = derive(c, reg).hpMax.total;
  return logOf(c);
};

describe("forms, preparing, summoned creatures' turns", () => {
  it("initiative uses the form's Dexterity", () => {
    const log = druid(8);
    expect(sheetOf(log).initiative.total).toBe(2);
    log.record("transform", { kind: "polymorph", creature: "creature:elephant", uses: 0 });
    const s = sheetOf(log);
    expect(s.initiative.total).toBe(-1);
    expect(s.initiative.parts[0]!.label).toMatch(/Elephant's Dexterity/);
  });

  it("Charge is offered on the Giant Boar's Tusk; trait dice are found", () => {
    const b = creatureBlock(reg, "creature:giant-boar")!;
    const tusk = b.attacks.find((a) => a.name === "Tusk")!;
    const all = [...tusk.damage.bonus.suggestions, ...tusk.attack.suggestions];
    expect(all.some((x) => x.label === "Charge")).toBe(true);
    expect(traitDice("At the start of each of its turns, it takes 5 (1d10) fire damage.")).toEqual({ dice: "1d10", type: "fire" });
  });

  it("preparing a spell from the class list adds it", () => {
    const log = druid(3);
    const notes = log.record("setPrepared", { spell: "spell:cure-wounds", list: "druid", prepared: true });
    expect(notes.join(" ")).not.toMatch(/isn't on this character's lists/);
    expect(log.character.spells.find((s) => s.spell === "spell:cure-wounds")?.prepared).toBe(true);
  });

  it("a summoned creature has its own action economy, effects and concentration", () => {
    const log = druid(5);
    log.record("summon", { spell: "spell:conjure-animals", group: "g", creatures: [{ creature: "creature:wolf", count: 1 }], concentration: true });
    const id = log.character.summons[0]!.id;
    log.record("summonEconomy", { id, kind: "attack" });
    expect(log.character.summons[0]!.used).toMatchObject({ action: true, attacks: 1 });
    log.record("summonEconomy", { id, kind: "bonus" });
    log.record("summonEffect", { id, effect: "effect:prone", add: true });
    log.record("summonEffect", { id, effect: "effect:bless", add: true, rounds: 2 });
    expect(log.character.summons[0]!.effects!.map((e) => e.effect)).toEqual(["effect:prone", "effect:bless"]);
    log.record("summonEconomy", { id, newTurn: true });
    expect(log.character.summons[0]!.used).toMatchObject({ action: false, bonus: false, attacks: 0 });
    log.record("summonEffect", { id, effect: "effect:prone", add: false });
    expect(log.character.summons[0]!.effects!.map((e) => e.effect)).toEqual(["effect:bless"]);
    log.record("summonConcentration", { id, spell: "Entangle" });
    expect(log.record("summonHp", { id, hp: 1 }).join(" ")).toMatch(/DC 10/);
    log.record("summonHp", { id, hp: 0 });
    expect(log.character.summons[0]!.concentrating).toBeUndefined();
  });
});
