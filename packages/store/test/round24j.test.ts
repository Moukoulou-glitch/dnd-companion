import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_899_300_000_000;
const pc = () => {
  const c = newCharacter({ id: "tr", name: "Tr", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const fx = (l: CharacterLog, id: string) => derive(l.character, reg).effects.find((e) => e.instanceId === id)!;

describe("24j: turn reminders for saves and ongoing damage", () => {
  it("Hold Person asks for a Wisdom save at the end of your turn and remembers the caster's DC", () => {
    const l = pc();
    l.record("addEffect", { instanceId: "hp", effect: "effect:hold-person" });
    expect(fx(l, "hp").turn).toMatchObject({ when: "end", save: { ability: "wis", ends: true } });
    l.record("updateEffect", { instanceId: "hp", dc: 15 });
    expect(fx(l, "hp").turn?.dc).toBe(15);
    l.record("updateEffect", { instanceId: "hp", dc: 0 });
    expect(fx(l, "hp").turn?.dc).toBeUndefined();
  });
  it("Tasha's Caustic Brew scales its start-of-turn acid with the slot", () => {
    const l = pc();
    l.record("addEffect", { instanceId: "cb", effect: "effect:tashas-caustic-brew", castLevel: 3 });
    expect(fx(l, "cb").turn).toMatchObject({ when: "start", damage: { dice: "6d4", type: "acid" } });
  });
  it("Heat Metal is triggered by the caster, 3d8 at 3rd level", () => {
    const l = pc();
    l.record("addEffect", { instanceId: "hm", effect: "effect:heat-metal", castLevel: 3 });
    expect(fx(l, "hm").turn).toMatchObject({ when: "caster", damage: { dice: "3d8", type: "fire" } });
  });
  it("Eyebite only asks for a save while Sickened", () => {
    const l = pc();
    l.record("addEffect", { instanceId: "eb", effect: "effect:eyebite", choice: "Panicked" });
    expect(fx(l, "eb").turn).toBeUndefined();
    l.record("addEffect", { instanceId: "eb2", effect: "effect:eyebite", choice: "Sickened" });
    expect(fx(l, "eb2").turn?.save?.ability).toBe("wis");
  });
  it("every listed spell has its reminder", () => {
    for (const id of ["hold-person", "hideous-laughter", "crown-of-madness", "slow", "hold-monster", "psychic-scream", "cause-fear", "blindness-deafness", "phantasmal-force", "phantasmal-killer", "contagion", "flesh-to-stone", "searing-smite-burning", "immolation"]) {
      const d = reg.get(`effect:${id}`, "effect");
      expect(d.turn, id).toBeTruthy();
    }
  });
});
