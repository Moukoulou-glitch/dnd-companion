import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_893_000_000_000;
const pc = (cls: string, level: number, subclass?: string) => {
  const c = newCharacter({ id: "p", name: "P", race: "race:human", class: cls, abilities: { str: 14, dex: 14, con: 14, int: 16, wis: 16, cha: 12 } }, reg);
  c.classes = [{ class: cls, level, ...(subclass ? { subclass } : {}) }];
  c.hp = { current: derive(c, reg).hpMax.total, temp: 0 };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("22m: fixes found in the 10th–13th-level features", () => {
  it("Song of Defense spends the slot picked", () => {
    const l = pc("class:wizard", 10, "subclass:bladesinging");
    expect(l.record("useAction", { action: "song-of-defense", choice: "3rd (15)" }).join(" ")).toMatch(/level 3 spell slot spent/);
    expect(l.character.slotsUsed["3"]).toBe(1);
  });
  it("Drake's Breath again for a spell slot of 3rd level or higher", () => {
    const l = pc("class:ranger", 11, "subclass:drakewarden");
    const a = derive(l.character, reg).actions.find((x) => x.id === "drakes-breath-slot")!;
    expect(a.choose?.options).toEqual(["3rd-level slot", "4th-level slot", "5th-level slot"]);
    l.record("useAction", { action: "drakes-breath-slot", choice: "3rd-level slot", rolled: 20 });
    expect(l.character.slotsUsed["3"]).toBe(1);
  });
  it("Searing Sunburst: up to 3 ki more, 2d6 each", () => {
    const s = derive(pc("class:monk", 11, "subclass:way-of-the-sun-soul").character, reg);
    expect([1, 2, 3].map((n) => s.actions.find((a) => a.id === `searing-sunburst-${n}`)?.roll?.text)).toEqual(["4d6", "6d6", "8d6"]);
    expect(s.actions.find((a) => a.id === "searing-sunburst-3")?.cost?.amount).toBe(3);
  });
  it("Guarded Mind ends charmed and frightened", () => {
    const l = pc("class:fighter", 10, "subclass:psi-warrior");
    l.record("addEffect", { instanceId: "ch", effect: "condition:charmed" });
    l.record("addEffect", { instanceId: "fr", effect: "condition:frightened" });
    l.record("useAction", { action: "guarded-mind" });
    expect(l.character.effects.map((e) => e.effect)).not.toContain("condition:charmed");
    expect(l.character.effects.map((e) => e.effect)).not.toContain("condition:frightened");
  });
  it("Tireless: a short rest takes a level of exhaustion off", () => {
    const l = pc("class:ranger", 10);
    l.record("addEffect", { instanceId: "ex", effect: "condition:exhaustion" });
    l.record("addEffect", { instanceId: "ex2", effect: "condition:exhaustion" });
    const lv = () => l.character.effects.find((e) => e.effect === "condition:exhaustion")?.level;
    expect(lv()).toBe(2);
    expect(l.record("rest", { kind: "short" }).join(" ")).toMatch(/Tireless: exhaustion down to level 1/);
    expect(lv()).toBe(1);
  });
});

describe("22m: Celestial Resilience", () => {
  it("temporary hit points at the end of a short or long rest", () => {
    const l = pc("class:warlock", 10, "subclass:the-celestial");
    expect(l.record("rest", { kind: "short" }).join(" ")).toMatch(/Celestial Resilience: 11 temporary hit points \(up to five allies get 6 each\)/);
    expect(l.character.hp.temp).toBe(11);
    l.record("rest", { kind: "long" });
    expect(l.character.hp.temp).toBe(11);
  });
});
