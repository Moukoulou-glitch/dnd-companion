import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { offersRelentless } from "../src/zeroHp.js";

const reg = tableRegistry();
let t = 1_892_000_000_000;
const pc = (cls: string, level: number, subclass: string) => {
  const c = newCharacter({ id: "p", name: "P", race: "race:human", class: cls, abilities: { str: 14, dex: 12, con: 14, int: 16, wis: 14, cha: 16 } }, reg);
  c.classes = [{ class: cls, level, subclass }];
  c.hp = { current: derive(c, reg).hpMax.total, temp: 0 };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const res = (l: CharacterLog, id: string) => derive(l.character, reg).resources.find((r) => r.id === id)!;

describe("22l: fixes found in the 14th–16th-level features", () => {
  it("Limited Wish: back only after the 1d4 long rests rolled", () => {
    const l = pc("class:warlock", 14, "subclass:the-genie");
    expect(l.record("useAction", { action: "limited-wish", rolled: 3 }).join(" ")).toMatch(/back after 3 long rests/);
    l.record("rest", { kind: "long" });
    l.record("rest", { kind: "long" });
    expect(res(l, "limited-wish").used).toBe(1);
    expect(l.record("rest", { kind: "long" }).join(" ")).toMatch(/back after the long rests it needed/);
    expect(res(l, "limited-wish").used).toBe(0);
    expect(l.character.resourceHolds).toBeUndefined();
  });
  it("Undying Sentinel: offered at 0 HP like Relentless Endurance, and drops you to 1", () => {
    const l = pc("class:paladin", 15, "subclass:oath-of-the-ancients");
    const dmg = { amount: l.character.hp.current };
    expect(offersRelentless(l.character, dmg, reg)).toBe(true);
    expect(l.record("damage", { ...dmg, relentless: true }).join(" ")).toMatch(/Undying Sentinel: you drop to 1 hit point instead/);
    expect(l.character.hp.current).toBe(1);
    expect(res(l, "undying-sentinel").used).toBe(1);
  });
  it("Blazing Revival: half your hit point maximum back", () => {
    const l = pc("class:druid", 14, "subclass:circle-of-wildfire");
    const max = derive(l.character, reg).hpMax.total;
    expect(derive(l.character, reg).actions.find((a) => a.id === "blazing-revival")?.heal).toBeDefined();
    l.record("damage", { amount: max });
    l.record("useAction", { action: "blazing-revival", rolled: Math.floor(max / 2) });
    expect(l.character.hp.current).toBe(Math.floor(max / 2));
  });
  it("Faithful Summons: four beasts of CR 2 or lower", () => {
    const s = reg.find("summon:faithful-summons", "summon")!;
    expect([s.type, s.tiers]).toEqual([["beast"], [{ maxCr: 2, count: 4 }]]);
    const a = derive(pc("class:druid", 14, "subclass:circle-of-the-shepherd").character, reg).actions.find((x) => x.id === "faithful-summons")!;
    expect(a.opensSummon).toEqual({ summon: "summon:faithful-summons" });
  });
  it("Bulwark of Force: again for a Psionic Energy die", () => {
    const a = derive(pc("class:fighter", 15, "subclass:psi-warrior").character, reg).actions.find((x) => x.id === "bulwark-of-force-die")!;
    expect(a.cost?.resource).toBe("psionic-energy-psi-warrior");
    expect(a.toggles).toContain("bulwark-of-force");
  });
});

describe("22l: Searing Vengeance and Protective Spirit", () => {
  it("Searing Vengeance heals half your maximum; its burst is its own roll", () => {
    const s = derive(pc("class:warlock", 14, "subclass:the-celestial").character, reg);
    expect(s.actions.find((a) => a.id === "searing-vengeance")?.heal).toBeDefined();
    expect(s.actions.find((a) => a.id === "searing-vengeance-burst")?.roll?.text).toMatch(/^2d8/);
  });
  it("Protective Spirit heals 1d6 + half your paladin level", () => {
    const s = derive(pc("class:paladin", 15, "subclass:oath-of-redemption").character, reg);
    expect(s.actions.find((a) => a.id === "protective-spirit")?.heal?.text).toBe("1d6 + 7");
  });
});
