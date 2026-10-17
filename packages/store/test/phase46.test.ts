import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_870_000_000_000;

describe("8g: levels beyond 20 are warned about, never blocked", () => {
  it("a 20th-level fighter can go to 21 if the table allows it; the app says it's beyond the rules", () => {
    const c = newCharacter({ id: "x", name: "X", race: "race:human", class: "class:fighter", abilities: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 8 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 20 };
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    const notes = l.record("levelUp", { class: "class:fighter" });
    expect(l.character.classes[0]!.level).toBe(21);
    expect(notes.join(" ")).toMatch(/stops at 20/);
    expect(notes.join(" ")).toMatch(/Character level 21: beyond the rules/);
    expect(derive(l.character, reg).level).toBe(21);
  });
});
