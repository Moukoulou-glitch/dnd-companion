import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_812_000_000_000;
const storm = (sorc: number) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: "class:cleric", abilities: { str: 16, dex: 14, con: 14, int: 12, wis: 18, cha: 18 } }, reg);
  c.classes = [{ class: "class:cleric", level: 6, subclass: "subclass:tempest-domain" }, { class: "class:sorcerer", level: sorc, subclass: "subclass:storm-sorcery" }];
  c.choices["feature:metamagic-1"] = { option: ["feature:metamagic-transmuted-spell", "feature:metamagic-quickened-spell"] };
  c.spells = ["spell:shatter", "spell:fireball", "spell:fire-bolt", "spell:mage-armor"].map((spell) => ({ spell, list: "sorcerer", prepared: false }));
  c.hp = { current: 60, temp: 0 };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const cast = (l: CharacterLog, spell: string, level: number) => l.record("castSpell", { spell, list: "sorcerer", level, using: "slot" }).join(" ");

describe("casting reminders for a storm caster", () => {
  it("Tempestuous Magic with any 1st-level or higher spell, not a cantrip", () => {
    const l = storm(5);
    expect(cast(l, "spell:mage-armor", 1)).toMatch(/Tempestuous Magic: right before or after this spell/);
    expect(cast(l, "spell:fire-bolt", 0)).not.toMatch(/Tempestuous Magic/);
  });
  it("Heart of the Storm: on Shatter; on Fireball only if you make it lightning or thunder; not on Mage Armor", () => {
    const l = storm(6);
    expect(cast(l, "spell:shatter", 2)).toMatch(/Heart of the Storm: as you start casting it, creatures you choose within 10 ft that you can see take 3 lightning or thunder damage/);
    expect(cast(l, "spell:fireball", 3)).toMatch(/Heart of the Storm \(if you make its damage lightning or thunder\):/);
    expect(cast(l, "spell:mage-armor", 1)).not.toMatch(/Heart of the Storm/);
  });
});
