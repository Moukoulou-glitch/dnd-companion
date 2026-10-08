import { describe, expect, it } from "vitest";
import { derive, newCharacter, summonBlock } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 2_200_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
const druid = () => {
  const c = newCharacter({ id: "d", name: "Yoyo", race: "race:dragonborn", class: "class:druid", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 8 };
  c.hp.current = derive(c, reg).hpMax.total;
  return logOf(c);
};

describe("summons: Barkskin on itself, uses, maximum by hand", () => {
  it("Barkskin raises a gargoyle's AC to 16; uses can be given back; maximum HP by hand", () => {
    const log = druid();
    log.record("summon", { spell: "spell:conjure-minor-elementals", group: "g", creatures: [{ creature: "creature:gargoyle", count: 1 }] });
    const m = () => log.character.summons[0]!;
    expect(summonBlock(reg, m())!.ac).toBe(15);
    log.record("summonEffect", { id: m().id, effect: "effect:barkskin", add: true, rounds: 600 });
    expect(summonBlock(reg, m())!.ac).toBe(16);

    log.record("summonCast", { id: m().id, spell: "Legendary Resistance", key: "use:Legendary Resistance (3/Day)", max: 3, economy: "none" });
    log.record("summonCast", { id: m().id, spell: "Legendary Resistance", key: "use:Legendary Resistance (3/Day)", max: 3, economy: "none" });
    log.record("summonCast", { id: m().id, spell: "Legendary Resistance", key: "use:Legendary Resistance (3/Day)", economy: "none", restore: true });
    expect(m().spellUses!["use:Legendary Resistance (3/Day)"]).toBe(1);
    expect(m().used?.action ?? false).toBe(false);

    log.record("summonMaxHpAdjust", { id: m().id, reduce: 10 });
    expect(m().hp).toBe(42);
    expect(summonBlock(reg, m())!.hp.max).toBe(42);
    log.record("summonMaxHpAdjust", { id: m().id, reduce: 0 });
    expect(summonBlock(reg, m())!.hp.max).toBe(52);
    expect(m().maxHpAdjust).toBeUndefined();
  });
});
