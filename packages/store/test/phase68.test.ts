import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_805_000_000_000;
const make = (cls: string, level: number, extra: (c: ReturnType<typeof newCharacter>) => void = () => {}) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: cls, abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 16 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level };
  extra(c);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("13c in play", () => {
  it("Thief's Reflexes: a reminder when combat starts", () => {
    const thief = make("class:rogue", 17, (c) => (c.classes[0]!.subclass = "subclass:thief"));
    expect(thief.record("startCombat", {}).join(" ")).toMatch(/Thief's Reflexes: in this first round you take two turns/);
    expect(make("class:rogue", 16, (c) => (c.classes[0]!.subclass = "subclass:thief")).record("startCombat", {}).join(" ")).not.toMatch(/Thief's Reflexes/);
  });
  it("Countercharm switches itself on, for a round", () => {
    const l = make("class:bard", 6);
    l.record("useAction", { action: "countercharm" });
    expect(l.character.toggles).toContain("countercharm");
  });
  it("Psychic Teleportation spends a Psionic Energy die", () => {
    const l = make("class:rogue", 9, (c) => (c.classes[0]!.subclass = "subclass:soulknife"));
    l.record("useAction", { action: "psychic-teleportation" });
    expect(l.character.resourcesUsed["psionic-energy"]).toBe(1);
  });
});
