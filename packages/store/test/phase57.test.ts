import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_795_000_000_000;

describe("9d: Summon Draconic Spirit's Shared Resistances on the caster", () => {
  it("cast with its effect on you, the chosen type is a resistance until concentration ends", () => {
    const c = newCharacter({ id: "w", name: "Wyn", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 10, cha: 10 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 9 };
    c.spells.push({ spell: "spell:summon-draconic-spirit", list: "wizard", prepared: true });
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("castSpell", { spell: "spell:summon-draconic-spirit", list: "wizard", level: 5, using: "slot", selfEffect: true, choice: "thunder" });
    const e = l.character.effects.find((x) => x.effect === "effect:summon-draconic-spirit");
    expect(e?.choice).toBe("thunder");
    expect(derive(l.character, reg).defenses.resist).toContain("thunder");
    l.record("endConcentration", {});
    expect(derive(l.character, reg).defenses.resist).not.toContain("thunder");
  });
});
