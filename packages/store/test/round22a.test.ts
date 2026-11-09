import { describe, expect, it } from "vitest";
import { customCompanionId, derive, newCharacter } from "@dnd/engine";
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
  it("a summoned creature gets the temporary HP (the higher stays); Traveler on it ends with them", () => {
    const l = spirits();
    l.record("summon", { spell: "spell:conjure-animals", group: "g", creatures: [{ creature: "creature:wolf", count: 1 }] });
    const id = l.character.summons[0]!.id;
    l.record("summonHp", { id, temp: 8 });
    expect(l.record("summonHp", { id, temp: 5 }).join(" ")).toMatch(/don't stack, keeping 8/);
    l.record("summonEffect", { id, effect: "other:spirit-tale-traveler", add: true });
    expect(l.character.summons[0]!.effects?.map((e) => e.effect)).toEqual(["other:spirit-tale-traveler"]);
    expect(l.record("summonHp", { id, damage: 10 }).join(" ")).toMatch(/temporary hit points are gone, so Tale of the Traveler ends/);
    expect(l.character.summons[0]!.effects ?? []).toEqual([]);
  });
  it("Traveler on a companion ends with its temporary HP", () => {
    const l = spirits();
    l.record("setCustomCompanion", { companion: { id: "d1", name: "Argos", kind: "Pet", size: "Medium", type: "beast", ac: 12, hpMax: 9, speed: "40 ft.", abilities: { str: 13, dex: 14, con: 12, int: 3, wis: 12, cha: 7 }, traits: [], attacks: [], notes: "" } as never });
    const id = customCompanionId("d1");
    l.record("setTempHp", { amount: 6, companion: id });
    l.record("companionEffect", { companion: id, effect: "other:spirit-tale-traveler", add: true });
    expect(l.record("damage", { amount: 7, companion: id }).join(" ")).toMatch(/Argos: the temporary hit points are gone, so Tale of the Traveler ends/);
    expect(l.character.companions[id]!.effects ?? []).toEqual([]);
  });
});
