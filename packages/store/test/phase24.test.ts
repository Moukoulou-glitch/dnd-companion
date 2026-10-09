import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();

describe("Small fixes", () => {
  it("Otherworldly Glamour adds Wisdom to Charisma checks, at least +1", () => {
    const c = newCharacter({ id: "r", name: "R", race: "race:human", class: "class:ranger", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 7, cha: 12 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 3, subclass: "subclass:fey-wanderer" };
    const s = derive(c, reg);
    // Wisdom 7 is −2: the glamour still adds +1.
    expect(s.skills.persuasion.parts.find((p) => p.label.startsWith("Otherworldly Glamour"))?.value).toBe(1);
  });
});
