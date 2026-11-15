import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_899_000_000_000;

describe("22z: Whistle of the Ashen Gale (homebrew)", () => {
  const pc = (cha: number) => {
    const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha } }, reg);
    c.classes = [{ class: "class:fighter", level: 5 }];
    c.inventory.push({ id: "wh", item: "item:whistle-of-the-ashen-gale", quantity: 1, equipped: true, attuned: true });
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("Charisma 16 unless higher; thaumaturgy; the wind adds 10 × proficiency bonus to speed, once per short rest", () => {
    const l = pc(8);
    const s = derive(l.character, reg);
    expect(s.abilities.cha.score.total).toBe(16);
    expect(derive(pc(17).character, reg).abilities.cha.score.total).toBe(18);
    expect(s.spells.some((x) => x.id === "spell:thaumaturgy")).toBe(true);
    const before = s.speed.total;
    l.record("useAction", { action: "whistle-ashen-gale" });
    expect(derive(l.character, reg).speed.total).toBe(before + 30);
    expect(l.character.resourcesUsed["whistle-ashen-gale"]).toBe(1);
    l.record("rest", { kind: "short" });
    expect(l.character.resourcesUsed["whistle-ashen-gale"] ?? 0).toBe(0);
  });
});
