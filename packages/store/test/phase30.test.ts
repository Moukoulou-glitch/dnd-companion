import { describe, expect, it } from "vitest";
import type { Character } from "@dnd/schema";
import { derive, newCharacter } from "@dnd/engine";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_803_000_000_000;
const warden = (level: number) => {
  const c = newCharacter({ id: "d", name: "D", race: "race:human", class: "class:ranger", abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 16, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, subclass: "subclass:drakewarden" };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const drake = (c: Character) => derive(c, reg).companions.find((x) => x.id === "drake")!;

describe("Drakewarden: the drake companion", () => {
  it("3rd level: Draconic Gift and a drake to summon, with no form until you do", () => {
    const l = warden(3);
    const s = derive(l.character, reg);
    expect(s.features.map((f) => f.id)).toEqual(expect.arrayContaining(["feature:drakewarden-draconic-gift", "feature:drakewarden-drake-companion"]));
    expect(s.spells.some((x) => x.id === "spell:thaumaturgy")).toBe(true);
    const d = drake(l.character);
    expect(d.form).toBeUndefined();
    expect(d.forms.map((f) => f.id)).toEqual(["acid", "cold", "fire", "lightning", "poison"]);
    expect(d.summon).toMatchObject({ resource: "drake-companion", slotMin: 1 });
    expect(d.command).toEqual({ economy: "bonus", attackInstead: false });
  });

  it("summoning: free once per long rest, then with a slot; picks the essence and brings full hit points", () => {
    const l = warden(3);
    l.record("summonCompanion", { companion: "drake", form: "fire" });
    expect(l.character.resourcesUsed["drake-companion"]).toBe(1);
    let d = drake(l.character);
    // Small dragon: AC 14 + PB, HP 5 + 5 per ranger level.
    expect(d.form).toMatchObject({ name: "Fire drake", size: "Small", type: "dragon", speed: "40 ft.", hp: { current: 20, temp: 0 } });
    expect(d.form!.ac.total).toBe(16);
    expect(d.form!.hpMax.total).toBe(20);
    const bite = d.form!.attacks[0]!;
    expect(bite.attack.total).toBe(derive(l.character, reg).spellcasting.find((x) => x.id === "ranger")!.attack.total);
    expect(bite.damage).toMatchObject({ dice: "1d6", type: "piercing", bonus: { total: 2 } });
    expect(bite.damage.bonus.dice).toEqual([]);
    expect(d.form!.abilities.dex.save.total).toBe(1 + 2);
    expect(d.form!.abilities.wis.save.parts).toEqual([{ label: "Wisdom save (stat block)", value: 2 }, { label: "Proficiency bonus", value: 2 }]);
    expect(d.form!.abilities.str.save.total).toBe(3);
    expect(d.form!.traits.map((x) => x.name)).toEqual(["Draconic Essence", "Infused Strikes"]);

    l.record("damage", { amount: 30, companion: "drake" });
    expect(drake(l.character).form!.hp.current).toBe(0);
    // No free use left: summoned anyway with a warning (never blocked)...
    const before = l.character.slotsUsed["1"] ?? 0;
    l.record("summonCompanion", { companion: "drake", form: "cold", level: 1 });
    d = drake(l.character);
    expect(d.form).toMatchObject({ name: "Cold drake", hp: { current: 20 } });
    expect(l.character.slotsUsed["1"]).toBe(before + 1);
  });

  it("7th level: Medium, winged, Magic Fang, and you resist its essence while it's out", () => {
    const l = warden(7);
    expect(derive(l.character, reg).defenses.resist).not.toContain("lightning");
    l.record("summonCompanion", { companion: "drake", form: "lightning" });
    const s = derive(l.character, reg);
    const d = s.companions.find((x) => x.id === "drake")!;
    expect(d.form).toMatchObject({ size: "Medium", speed: "40 ft., fly 40 ft." });
    expect(d.form!.attacks[0]!.damage.bonus.dice).toEqual([{ label: "Bond of Fang and Scale", dice: "1d6", damageType: "lightning" }]);
    expect(d.form!.traits.map((x) => x.name)).toContain("Drake Mount");
    expect(s.defenses.resist).toContain("lightning");
    // Gone (0 HP): no resistance.
    l.record("damage", { amount: 99, companion: "drake" });
    expect(derive(l.character, reg).defenses.resist).not.toContain("lightning");
  });

  it("11th and 15th: Drake's Breath (8d6, then 10d6, spell save DC); 15th: Large, 2d6 extra, Reflexive Resistance", () => {
    const l11 = warden(11);
    const s11 = derive(l11.character, reg);
    const br = s11.actions.find((a) => a.id === "drakes-breath")!;
    expect(br.roll?.dice).toEqual(["8d6"]);
    expect(br.choose?.options).toEqual(["Acid", "Cold", "Fire", "Lightning", "Poison"]);
    expect(br.dc).toMatchObject({ value: s11.spellcasting.find((x) => x.id === "ranger")!.saveDc.total, save: "Dexterity" });
    expect(s11.resources.find((r) => r.id === "drakes-breath")).toMatchObject({ max: 1, reset: "long" });

    const l = warden(15);
    l.record("summonCompanion", { companion: "drake", form: "acid" });
    const s = derive(l.character, reg);
    expect(s.actions.find((a) => a.id === "drakes-breath")!.roll?.dice).toEqual(["10d6"]);
    const d = s.companions.find((x) => x.id === "drake")!;
    expect(d.form!.size).toBe("Large");
    expect(d.form!.attacks[0]!.damage.bonus.dice.map((x) => `${x.dice} ${x.damageType}`)).toEqual(["1d6 acid", "1d6 acid"]);
    expect(s.resources.find((r) => r.id === "reflexive-resistance")).toMatchObject({ max: 5 });
    expect(s.actions.find((a) => a.id === "reflexive-resistance")).toMatchObject({ economy: "reaction" });
  });

  it("other companions are as before (Primal Companion: bonus action, can attack in place of yours)", () => {
    const c = loadCharacter("beren");
    expect(derive(c, reg).companions.find((x) => x.id === "primal-beast")).toMatchObject({ command: { economy: "bonus", attackInstead: true } });
    expect(derive(c, reg).companions.find((x) => x.id === "primal-beast")!.summon).toBeUndefined();
  });
});
