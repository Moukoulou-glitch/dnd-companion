import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_794_000_000_000;
const down = () => {
  const c = newCharacter({ id: "d", name: "Dora", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
  const l = new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
  l.record("damage", { amount: c.hp.current });
  return l;
};
const stable = (l: CharacterLog) => l.character.effects.find((e) => e.effect === "other:stable");

describe("9c: stable at 0 HP", () => {
  it("the third success: stable, saves cleared, asked for the hours", () => {
    const l = down();
    l.record("deathSave", { result: "success" });
    l.record("deathSave", { result: "success" });
    expect(stable(l)).toBeUndefined();
    l.record("deathSave", { result: "success" });
    expect(l.lastPrompts.some((p) => p.kind === "stable")).toBe(true);
    expect(l.character.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(stable(l)?.minutes).toBeUndefined();
    // The 1d4 rolled: 3 hours.
    l.record("stabilize", { hours: 3 });
    expect(stable(l)).toMatchObject({ minutes: 180, from: "three successful death saves" });
  });
  it("told by the player (Spare the Dying), the hours run out: 1 HP", () => {
    const l = down();
    l.record("deathSave", { result: "failure" });
    l.record("stabilize", { how: "Spare the Dying", hours: 2 });
    expect(l.character.deathSaves).toEqual({ successes: 0, failures: 0 });
    l.record("passTime", { minutes: 60 });
    expect(l.character.hp.current).toBe(0);
    expect(stable(l)?.minutes).toBe(60);
    expect(l.record("passTime", { minutes: 60 }).join(" ")).toMatch(/regain 1 HP/);
    expect(l.character.hp.current).toBe(1);
    expect(stable(l)).toBeUndefined();
  });
  it("healing ends it; damage ends it and the saves start again", () => {
    const healed = down();
    healed.record("stabilize", { how: "a Medicine check (DC 10)", hours: 4 });
    healed.record("heal", { amount: 5 });
    expect(stable(healed)).toBeUndefined();
    const hurt = down();
    hurt.record("stabilize", { how: "a healer's kit", hours: 4 });
    expect(hurt.record("damage", { amount: 2 }).join(" ")).toMatch(/no longer stable/);
    expect(stable(hurt)).toBeUndefined();
    expect(hurt.character.deathSaves.failures).toBe(1);
  });
  it("marking the third success by hand does the same", () => {
    const l = down();
    l.record("setDeathSaves", { successes: 3, failures: 1 });
    expect(l.lastPrompts.some((p) => p.kind === "stable")).toBe(true);
    expect(l.character.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(stable(l)).toBeTruthy();
  });
});
