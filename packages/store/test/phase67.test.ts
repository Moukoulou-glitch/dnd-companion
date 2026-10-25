import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_804_000_000_000;
const make = (cls: string, level: number, extra: (c: ReturnType<typeof newCharacter>) => void = () => {}) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: cls, abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 16, cha: 16 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level };
  extra(c);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("13b in play", () => {
  it("Sorcerous Restoration: a short rest gives back 4 sorcery points", () => {
    const l = make("class:sorcerer", 20, (c) => (c.resourcesUsed["sorcery-points"] = 10));
    const notes = l.record("rest", { kind: "short" });
    expect(l.character.resourcesUsed["sorcery-points"]).toBe(6);
    expect(notes.join(" ")).toMatch(/Sorcerous Restoration: 4 Sorcery points back/);
  });
  it("Eldritch Master: every Pact slot back, once per long rest", () => {
    const l = make("class:warlock", 20, (c) => (c.pactSlotsUsed = 4));
    l.record("useAction", { action: "eldritch-master" });
    expect(l.character.pactSlotsUsed).toBe(0);
    expect(derive(l.character, reg).resources.find((r) => r.id === "eldritch-master")?.remaining).toBe(0);
  });
  it("Stillness of Mind ends the condition picked", () => {
    const l = make("class:monk", 7);
    l.record("addEffect", { instanceId: "a", effect: "condition:charmed" });
    l.record("addEffect", { instanceId: "b", effect: "condition:frightened" });
    expect(l.character.effects.map((e) => e.effect)).toEqual(["condition:charmed", "condition:frightened"]);
    l.record("useAction", { action: "stillness-of-mind", choice: "Frightened" });
    expect(l.character.effects.map((e) => e.effect)).toEqual(["condition:charmed"]);
  });
  it("Archdruid: Wild Shape after Wild Shape, never out", () => {
    const l = make("class:druid", 20);
    for (let i = 0; i < 3; i++) l.record("useAction", { action: "wild-shape" });
    expect(derive(l.character, reg).resources.find((r) => r.id === "wild-shape")?.remaining).toBe(2);
  });
  it("Persistent Rage changes the end-of-turn reminder; Thief's Reflexes gives a second turn's initiative", () => {
    const b = make("class:barbarian", 15, (c) => c.toggles.push("raging"));
    expect(b.record("endTurn", {}).join(" ")).toMatch(/Persistent Rage/);
    const r = make("class:rogue", 17, (c) => (c.classes[0] = { ...c.classes[0]!, subclass: "subclass:thief" }));
    expect(r.record("setInitiative", { value: 18 }).join(" ")).toMatch(/initiative 8 in the first round/);
  });
});
