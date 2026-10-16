import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { offersRelentless } from "../src/zeroHp.js";

const reg = tableRegistry();
let t = 1_810_000_000_000;
/** A 1st-level Half-Orc fighter: Constitution 14 + 1 = 15, so 12 hit points. */
const orc = (race = "race:half-orc", concentrating = false) => {
  const c = newCharacter({ id: "o", name: "O", race, class: "class:fighter", abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 8 } }, reg);
  if (concentrating) c.concentration = { spell: "spell:bless", name: "Bless" } as never;
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const hp = (l: CharacterLog) => l.character.hp.current;
const left = (l: CharacterLog) => derive(l.character, reg).resources.find((r) => r.id === "relentless-endurance")?.remaining;

describe("Relentless Endurance: asked when damage would drop you to 0", () => {
  it("is offered for damage that drops you to 0 without killing you outright", () => {
    const l = orc();
    expect(derive(l.character, reg).hpMax.total).toBe(12);
    expect(left(l)).toBe(1);
    expect(offersRelentless(l.character, { amount: 15 }, reg)).toBe(true);
    // Not for damage that leaves you standing, nor for massive damage (12 over 0 at 12 HP max: killed outright).
    expect(offersRelentless(l.character, { amount: 11 }, reg)).toBe(false);
    expect(offersRelentless(l.character, { amount: 24 }, reg)).toBe(false);
    // Asking changes nothing.
    expect(hp(l)).toBe(12);
  });

  it("accepted: 1 hit point instead, the use spent once, concentration kept (you never hit 0)", () => {
    const l = orc("race:half-orc", true);
    const res = l.record("damage", { amount: 15, relentless: true });
    expect(hp(l)).toBe(1);
    expect(l.character.concentration?.name).toBe("Bless");
    expect(l.lastPrompts.some((p) => p.kind === "concentration")).toBe(true);
    expect(left(l)).toBe(0);
    expect(res.join(" ")).toMatch(/Relentless Endurance: you drop to 1/);
    // Not offered again before a long rest; recording it anyway just drops you to 0, with a note.
    l.record("heal", { amount: 11 });
    expect(offersRelentless(l.character, { amount: 15 }, reg)).toBe(false);
    const again = l.record("damage", { amount: 15, relentless: true });
    expect(hp(l)).toBe(0);
    expect(again.join(" ")).toMatch(/already used/);
    l.record("rest", { kind: "long" });
    expect(left(l)).toBe(1);
  });

  it("declined: you drop to 0 and the use is kept", () => {
    const l = orc();
    l.record("damage", { amount: 15 });
    expect(hp(l)).toBe(0);
    expect(left(l)).toBe(1);
    // Already at 0: nothing to offer.
    expect(offersRelentless(l.character, { amount: 3 }, reg)).toBe(false);
  });

  it("killed outright by massive damage: it can't help even if chosen", () => {
    const l = orc();
    const r = l.record("damage", { amount: 24, relentless: true });
    expect(hp(l)).toBe(0);
    expect(l.character.deathSaves.failures).toBe(3);
    expect(l.lastPrompts.some((p) => p.kind === "dead")).toBe(true);
    expect(left(l)).toBe(1);
  });

  it("counts after temporary HP and resistances", () => {
    const l = orc();
    l.record("setTempHp", { amount: 5 });
    expect(offersRelentless(l.character, { amount: 15 }, reg)).toBe(false);
    expect(offersRelentless(l.character, { amount: 17 }, reg)).toBe(true);
  });

  it("undo and replay give back the same result; undo returns the use", () => {
    const l = orc();
    l.record("damage", { amount: 15, relentless: true });
    expect([hp(l), left(l)]).toEqual([1, 0]);
    // The character is rebuilt from the log every time: same answer, no new question.
    expect([l.character.hp.current, l.character.resourcesUsed["relentless-endurance"]]).toEqual([1, 1]);
    l.undo();
    expect([hp(l), left(l)]).toEqual([12, 1]);
  });

  it("someone without the feature is never asked, and the flag does nothing", () => {
    const l = orc("race:human");
    expect(offersRelentless(l.character, { amount: 15 }, reg)).toBe(false);
    l.record("damage", { amount: 15, relentless: true });
    expect(hp(l)).toBe(0);
  });
});

describe("Death Ward (audited on its own rules)", () => {
  const warded = () => {
    const l = orc();
    l.record("addEffect", { instanceId: "dw", effect: "effect:death-ward" });
    return l;
  };

  it("works by itself the first time you'd drop to 0: 1 HP, and the spell ends; Relentless isn't used or asked", () => {
    const l = warded();
    expect(offersRelentless(l.character, { amount: 15 }, reg)).toBe(false);
    const r = l.record("damage", { amount: 15 });
    expect(hp(l)).toBe(1);
    expect(l.character.effects.some((e) => e.id === "dw")).toBe(false);
    expect(r.join(" ")).toMatch(/Death Ward/);
    expect(left(l)).toBe(1);
    // Next time, Relentless Endurance is offered.
    expect(offersRelentless(l.character, { amount: 5 }, reg)).toBe(true);
  });

  it("you never drop to 0, so massive damage doesn't kill you", () => {
    const l = warded();
    const r = l.record("damage", { amount: 40 });
    expect(hp(l)).toBe(1);
    expect(l.character.deathSaves.failures).toBe(0);
    expect(l.lastPrompts.some((p) => p.kind === "dead")).toBe(false);
  });

  it("damage that leaves you standing doesn't use it up", () => {
    const l = warded();
    l.record("damage", { amount: 5 });
    expect(hp(l)).toBe(7);
    expect(l.character.effects.some((e) => e.id === "dw")).toBe(true);
  });
});
