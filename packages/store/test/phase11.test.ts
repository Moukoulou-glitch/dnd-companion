import { describe, expect, it } from "vitest";
import { attackVariants, creatureBlock, creatureSpellRoll, creatureSpells, derive, newCharacter } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 1_900_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
const druid = () => {
  const c = newCharacter({ id: "d", name: "Yoyo", race: "race:dragonborn", class: "class:druid", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 9 };
  c.hp.current = derive(c, reg).hpMax.total;
  return logOf(c);
};

describe("stat blocks: attack variants, spells", () => {
  it("the Dryad's club, with shillelagh too; the Azer's warhammer two-handed", () => {
    const dryad = creatureBlock(reg, "creature:dryad")!;
    expect(dryad.attacks.map((a) => [a.name, a.attack.total, a.damage.dice, a.damage.bonus.total])).toEqual([
      ["Club", 2, "1d4", 0],
      ["Club (shillelagh)", 6, "1d8", 4],
    ]);
    const azer = creatureBlock(reg, "creature:azer")!;
    expect(azer.attacks.map((a) => a.name)).toEqual(["Warhammer", "Warhammer (two-handed)"]);
    expect(azer.attacks[1]!.damage).toMatchObject({ dice: "1d10", type: "bludgeoning" });
    expect(azer.attacks[1]!.damage.bonus.dice[0]).toMatchObject({ dice: "1d6", damageType: "fire" });
    expect(attackVariants({ name: "Talons", text: "Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 1 slashing damage." })[0]).toMatchObject({ damage: "1", toHit: 3, damageType: "slashing" });
  });

  it("reads innate spellcasting and casts with its DC", () => {
    const d = reg.find("creature:dryad", "creature")!;
    const [info] = creatureSpells(reg, d);
    expect(info).toMatchObject({ dc: 14, ability: "Charisma" });
    expect(info!.groups.map((g) => [g.label, g.perDay ?? null, g.spells.length])).toEqual([
      ["At will", null, 1],
      ["3/day each", 3, 2],
      ["1/day each", 1, 3],
    ]);
    const mage = creatureSpells(reg, reg.find("creature:mage", "creature")!)[0]!;
    expect(mage.groups.find((g) => g.level === 3)).toMatchObject({ slots: 3 });
    const fireball = reg.find("spell:fireball", "spell")!;
    expect(creatureSpellRoll(reg.find("creature:mage", "creature")!, fireball, 3, mage)).toMatchObject({ damage: { dice: "8d6", type: "fire" }, saveNote: expect.stringMatching(/DC 14 Dexterity/) });
  });

  it("a summoned creature's damage respects immunities; casting counts uses and concentration", () => {
    const log = druid();
    log.record("summon", { spell: "spell:conjure-animals", group: "g", creatures: [{ creature: "creature:azer", count: 1 }, { creature: "creature:dryad", count: 1 }] });
    const [azer, dryad] = log.character.summons;
    expect(log.record("summonHp", { id: azer!.id, damage: 10, type: "fire" }).join(" ")).toMatch(/immune to fire/);
    expect(log.character.summons[0]!.hp).toBe(39);
    log.record("summonHp", { id: azer!.id, damage: 10, type: "slashing" });
    expect(log.character.summons[0]!.hp).toBe(29);
    expect(log.record("summonEffect", { id: azer!.id, effect: "condition:poisoned", add: true }).join(" ")).toMatch(/immune to being poisoned/);
    log.record("summonCast", { id: dryad!.id, spell: "Entangle", key: "spell:entangle", max: 3, economy: "action", concentration: true });
    const d = log.character.summons[1]!;
    expect(d).toMatchObject({ concentrating: "Entangle", spellUses: { "spell:entangle": 1 }, used: { action: true } });
    log.record("summonCast", { id: dryad!.id, spell: "Barkskin", key: "spell:barkskin", max: 1, economy: "action", concentration: true });
    expect(log.record("summonCast", { id: dryad!.id, spell: "Barkskin", key: "spell:barkskin", max: 1, economy: "action" }).join(" ")).toMatch(/Beyond its stat block: 2 of 1/);
    expect(log.character.summons[1]!.concentrating).toBe("Barkskin");
  });
});
