import { describe, expect, it } from "vitest";
import { derive, newCharacter, summonBlock } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 2_300_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
const druid = () => {
  const c = newCharacter({ id: "d", name: "Yoyo", race: "race:dragonborn", class: "class:druid", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 8 };
  c.hp.current = derive(c, reg).hpMax.total;
  return logOf(c);
};

describe("shillelagh, summon concentration prompt, death saves, Charm of Sunlight tag", () => {
  it("the Dryad's club becomes the shillelagh club while the spell is on it", () => {
    const log = druid();
    log.record("summon", { spell: "spell:conjure-woodland-beings", group: "g", creatures: [{ creature: "creature:dryad", count: 1 }] });
    const m = () => log.character.summons[0]!;
    expect(summonBlock(reg, m())!.attacks.map((a) => a.name)).toEqual(["Club"]);
    log.record("summonEffect", { id: m().id, effect: "effect:shillelagh", add: true, rounds: 10 });
    const atk = summonBlock(reg, m())!.attacks;
    expect(atk.map((a) => [a.name, a.attack.total])).toEqual([["Club (shillelagh)", 6]]);
    expect(atk[0]!.note).toMatch(/shillelagh on/);
  });

  it("damage to a concentrating summoned creature asks for its save", () => {
    const log = druid();
    log.record("summon", { spell: "spell:conjure-woodland-beings", group: "g", creatures: [{ creature: "creature:dryad", count: 1 }] });
    const id = log.character.summons[0]!.id;
    log.record("summonConcentration", { id, spell: "Barkskin" });
    log.record("summonHp", { id, damage: 10 });
    expect(log.lastPrompts).toEqual([{ kind: "concentration", dc: 10, spell: "Barkskin", summon: id }]);
  });

  it("death saves set by hand; the Charm of Sunlight tag keeps its radius", () => {
    const log = druid();
    log.record("setDeathSaves", { successes: 1, failures: 2 });
    expect(log.character.deathSaves).toEqual({ successes: 1, failures: 2 });
    log.record("addEffect", { instanceId: "x", effect: "other:charm-of-sunlight", choice: "30 ft" });
    const e = derive(log.character, reg).effects.find((x) => x.id === "other:charm-of-sunlight")!;
    expect(e).toMatchObject({ minutes: 60, choice: { value: "30 ft" } });
  });
});
