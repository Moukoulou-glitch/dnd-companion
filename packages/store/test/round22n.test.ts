import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_894_000_000_000;
const pc = (cls: string, level: number, subclass?: string) => {
  const c = newCharacter({ id: "p", name: "P", race: "race:human", class: cls, abilities: { str: 14, dex: 16, con: 14, int: 12, wis: 12, cha: 12 } }, reg);
  c.classes = [{ class: cls, level, ...(subclass ? { subclass } : {}) }];
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("22n: fixes found in the 6th–9th-level features", () => {
  it("Tokens of the Departed: a soul trinket back in your hand, for your reaction", () => {
    const l = pc("class:rogue", 9, "subclass:phantom");
    l.record("useAction", { action: "destroy-soul-trinket" });
    const trinkets = () => derive(l.character, reg).resources.find((r) => r.id === "soul-trinkets")!;
    expect(trinkets().used).toBe(1);
    l.record("startCombat", {});
    l.record("useAction", { action: "tokens-of-the-departed" });
    expect(trinkets().used).toBe(0);
    expect(derive(l.character, reg).actions.find((a) => a.id === "tokens-of-the-departed")?.infoOnly).toBeFalsy();
  });
  it("Spirit Shield names its 4d6 at 14th level", () => {
    const a = derive(pc("class:barbarian", 14, "subclass:ancestral-guardian").character, reg).actions.find((x) => x.id === "spirit-shield")!;
    expect(a.roll?.text).toBe("4d6");
    expect(a.note).toMatch(/4d6 from 14th/);
  });
});

describe("22o: Form of the Beast's bite", () => {
  it("heals only below half your hit points: warned above it", () => {
    const l = pc("class:barbarian", 3, "subclass:path-of-the-beast");
    expect(derive(l.character, reg).actions.find((a) => a.id === "beast-bite-heal")?.belowHalfHp).toBe(true);
  });
});
