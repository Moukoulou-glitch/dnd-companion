import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_890_000_000_000;
const divine = (level: number, spells: { spell: string; list: string }[] = []) => {
  const c = newCharacter({ id: "s", name: "S", race: "race:human", class: "class:sorcerer", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 } }, reg);
  c.classes = [{ class: "class:sorcerer", level, subclass: "subclass:divine-soul" }];
  c.spells = spells.map((s) => ({ ...s, prepared: true })) as never;
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const sheet = (l: CharacterLog) => derive(l.character, reg);

describe("22c: Divine Soul and death saves", () => {
  it("Empowered Healing: on a healing spell's roll, any of its dice again for a sorcery point, once per turn", () => {
    const s = sheet(divine(6, [{ spell: "spell:cure-wounds", list: "sorcerer" }]));
    const cw = s.spells.find((x) => x.id === "spell:cure-wounds")!;
    expect(cw.damageBonus?.rerollOne).toMatchObject({ label: "Empowered Healing", count: 20, oncePerTurn: true, spends: { resource: "sorcery-points", amount: 1 } });
    expect(sheet(divine(5, [{ spell: "spell:cure-wounds", list: "sorcerer" }])).spells.find((x) => x.id === "spell:cure-wounds")!.damageBonus?.rerollOne).toBeUndefined();
  });
  it("Unearthly Recovery: half your hit point maximum; warned above half", () => {
    const l = divine(18);
    const max = sheet(l).hpMax.total;
    const a = sheet(l).actions.find((x) => x.id === "unearthly-recovery")!;
    expect([a.heal?.flat, a.heal?.dice, a.belowHalfHp]).toEqual([Math.floor(max / 2), [], true]);
    l.record("setHp", { current: max });
    expect(l.record("useAction", { action: "unearthly-recovery" }).join(" ")).toMatch(/only when you have fewer than half your hit points/);
  });
  it("death saves: advantage from Holy Aura (all saves) and Beacon of Hope", () => {
    const l = divine(1);
    expect(sheet(l).deathSave).toEqual({ advantage: [], disadvantage: [] });
    l.record("addEffect", { instanceId: "ha", effect: "effect:holy-aura" });
    expect(sheet(l).deathSave.advantage).toEqual(["Holy Aura"]);
    l.record("removeEffect", { instanceId: "ha" });
    l.record("addEffect", { instanceId: "bh", effect: "effect:beacon-of-hope" });
    expect(sheet(l).deathSave.advantage).toEqual(["Beacon of Hope"]);
  });
});
