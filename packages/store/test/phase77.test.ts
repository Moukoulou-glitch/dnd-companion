import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_814_000_000_000;
const eladrin = (level: number, season?: string) => {
  const c = newCharacter({ id: "e", name: "Test", race: "race:eladrin", class: "class:cleric", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 16, cha: 16 } }, reg);
  c.classes = [{ class: "class:cleric", level }];
  if (season) c.choices["race:eladrin"] = { season: [season] };
  c.hp = { current: 40, temp: 0 };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("Eladrin and Unbridled Seasons in play", () => {
  it("Heammer: Beacon of Hope through Unbridled Seasons takes no concentration, and its use is spent", () => {
    const l = eladrin(10, "Heammer");
    l.record("castSpell", { spell: "spell:bless", list: "cleric", level: 1, using: "slot" });
    expect(l.character.concentration?.spell).toBe("spell:bless");
    const notes = l.record("castSpell", { spell: "spell:beacon-of-hope", list: "unbridled-seasons", level: 3, using: "free" }).join(" ");
    expect(notes).toMatch(/no concentration this time/);
    expect(l.character.concentration?.spell).toBe("spell:bless");
    expect(l.character.resourcesUsed["unbridled-seasons-spell"]).toBe(1);
  });
  it("a long rest reminds an eladrin the season can change", () => {
    expect(eladrin(3, "Nocter").record("rest", { kind: "long" }).join(" ")).toMatch(/your season is Nocter; you can change it now/);
    expect(eladrin(3).record("rest", { kind: "long" }).join(" ")).toMatch(/choose your season/);
  });
});
