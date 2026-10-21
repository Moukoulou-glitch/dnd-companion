import { describe, expect, it } from "vitest";
import { newCharacter, spiritId, summonBlock } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_900_000_000_000;

describe("8l: a summoned spirit on the Play page", () => {
  it("Summon Aberration at 5th: the slaad spirit appears with its hit points, takes damage through its immunities, regenerates (in its text)", () => {
    const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 } }, reg);
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    const id = spiritId("summon:summon-aberration", "slaad", 5, 7, 15);
    const n = l.record("summon", { spell: "spell:summon-aberration", group: "g", creatures: [{ creature: id, count: 1 }], concentration: true });
    expect(n.join(" ")).toMatch(/Aberrant Spirit \(Slaad\) appears/);
    const m = l.character.summons[0]!;
    expect(m.hp).toBe(50);
    const b = summonBlock(reg, m)!;
    expect(b.ac).toBe(16);
    expect(b.attacks.find((a) => a.name === "Claws")!.attack.total).toBe(7);
    const r = l.record("summonHp", { id: m.id, damage: 12, type: "psychic" });
    expect(r.join(" ")).toMatch(/Immune to psychic/);
    expect(l.character.summons[0]!.hp).toBe(50);
  });
});
