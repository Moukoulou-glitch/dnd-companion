import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "../src/index.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();

describe("20d: Adama is a choice after the roll", () => {
  const c = newCharacter({ id: "h", name: "H", race: "race:half-elf", class: "class:rogue", abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 14 } }, reg);
  c.classes = [{ class: "class:rogue", level: 10 }];
  c.inventory.push({ id: "d", item: "item:dagger", quantity: 1, equipped: true, attuned: false } as never);
  const s = derive(c, reg);
  it("on attack rolls, ability checks and saving throws, with its use; no tick-box before the roll", () => {
    const want = { label: "Adama", natural: 20, spends: { resource: "adama", amount: 1 } };
    expect(s.attacks[0]!.attack.sumAfter).toEqual(want);
    expect(s.skills.stealth.sumAfter).toEqual(want);
    expect(s.saves.dex.sumAfter).toEqual(want);
    expect(s.attacks[0]!.attack.suggestions.some((x) => x.label === "Adama")).toBe(false);
    expect(s.resources.find((r) => r.id === "adama")?.max).toBe(4);
  });
  it("not before 10th level", () => {
    const low = { ...c, classes: [{ class: "class:rogue", level: 9 }] };
    expect(derive(low, reg).saves.dex.sumAfter).toBeUndefined();
  });
});
