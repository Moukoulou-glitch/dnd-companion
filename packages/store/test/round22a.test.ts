import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_880_000_000_000;
const spirits = (level = 6) => {
  const c = newCharacter({ id: "b", name: "B", race: "race:human", class: "class:bard", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 12, cha: 16 } }, reg);
  c.classes = [{ class: "class:bard", level, subclass: "subclass:college-of-spirits" }];
  c.hp = { current: 40, temp: 0 };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const held = (l: CharacterLog) => l.character.effects.filter((e) => e.id.includes("-held-")).map((e) => e.custom?.name);
const tags = (l: CharacterLog) => l.character.effects.map((e) => e.effect);

describe("22a: Tales from Beyond", () => {
  it("a tale is held; bestowing it ends the hold", () => {
    const l = spirits();
    l.record("useAction", { action: "tales-from-beyond", rolled: 6 });
    expect(held(l)).toEqual(["Tale held: Traveler"]);
    l.record("useAction", { action: "tales-from-beyond-bestow" });
    expect(held(l)).toEqual([]);
  });
  it("Traveler: +10 ft and +1 AC while its temporary hit points last", () => {
    const l = spirits();
    const ac = derive(l.character, reg).ac.total;
    l.record("setTempHp", { amount: 9 });
    l.record("addEffect", { instanceId: "tr", effect: "other:spirit-tale-traveler" });
    expect(derive(l.character, reg).ac.total).toBe(ac + 1);
    l.record("damage", { amount: 5 });
    expect(tags(l)).toContain("other:spirit-tale-traveler");
    expect(l.record("damage", { amount: 6 }).join(" ")).toMatch(/Tale of the Traveler: the temporary hit points are gone/);
    expect(tags(l)).not.toContain("other:spirit-tale-traveler");
    expect(derive(l.character, reg).ac.total).toBe(ac);
  });
  it("a new tale ends the last tale's effects, on you and on others", () => {
    const l = spirits();
    l.record("addEffect", { instanceId: "ca", effect: "other:spirit-tale-clever-animal", choice: "d8" });
    expect(derive(l.character, reg).skills.arcana.suggestions.some((s) => s.label === "Tale of the Clever Animal")).toBe(true);
    expect(l.record("useAction", { action: "tales-from-beyond", rolled: 2 }).join(" ")).toMatch(/The last tale ends: Tale of the Clever Animal/);
    expect(tags(l)).not.toContain("other:spirit-tale-clever-animal");
  });
  it("Mystical Connection: rolled twice, any tale on doubles", () => {
    const a = derive(spirits(14).character, reg).actions.find((x) => x.id === "tales-from-beyond")!;
    expect([a.roll?.times, a.roll?.anyOnDouble, a.roll?.dice]).toEqual([2, true, ["1d10"]]);
    expect(a.note).toMatch(/roll the die twice/);
  });
});
