import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_880_000_000_000;

describe("20a: Ioun Stones of Absorption", () => {
  it("absorbing a spell takes its level off the stone's 20", () => {
    const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 } }, reg);
    c.inventory.push({ id: "s", item: "item:ioun-stone-absorption", quantity: 1, equipped: true, attuned: true } as never);
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    expect(derive(l.character, reg).resources.find((r) => r.id === "ioun-stone-absorption")?.max).toBe(20);
    l.record("useAction", { action: "ioun-stone-absorption", amount: 3 });
    expect(derive(l.character, reg).resources.find((r) => r.id === "ioun-stone-absorption")?.remaining).toBe(17);
    expect(derive(l.character, reg).actions.find((a) => a.id === "ioun-stone-absorption")?.economy).toBe("reaction");
  });
});
