import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_809_000_000_000;
const make = (cls: string, level: number, subclass: string) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: cls, abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 14, cha: 10 } }, reg);
  c.classes = [{ class: cls, level, subclass }];
  c.hp = { current: 20, temp: 0 };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("14b in play", () => {
  it("Tranquility: a long rest puts Sanctuary on you until the next one, never two", () => {
    const l = make("class:monk", 11, "subclass:open-hand");
    expect(l.record("rest", { kind: "long" }).join(" ")).toMatch(/Tranquility: Sanctuary on you until your next long rest \(save DC 14\)/);
    l.record("rest", { kind: "long" });
    const s = l.character.effects.filter((e) => e.effect === "effect:sanctuary");
    expect(s).toHaveLength(1);
    expect(s[0]!.untilRest).toBe("long");
  });
  it("Physician's Touch ends the picked condition on you", () => {
    const l = make("class:monk", 6, "subclass:way-of-mercy");
    l.record("addEffect", { instanceId: "p1", effect: "condition:poisoned" });
    l.record("addEffect", { instanceId: "b1", effect: "condition:blinded" });
    l.record("useAction", { action: "physicians-touch", choice: "Poisoned" });
    expect(l.character.effects.map((e) => e.effect)).toEqual(["condition:blinded"]);
  });
  it("Keeper of Souls heals the number typed in", () => {
    const l = make("class:cleric", 17, "subclass:grave-domain");
    l.record("useAction", { action: "keeper-of-souls", rolled: 7, onMe: true });
    expect(l.character.hp.current).toBe(27);
  });
  it("Expansive Bond: Protective Bond's resistance halves the next damage, of any type, then ends", () => {
    const l = make("class:cleric", 17, "subclass:peace-domain");
    l.character.hp.current = 100;
    l.record("useAction", { action: "protective-bond" });
    expect(l.character.effects.some((e) => e.effect === "effect:protective-bond")).toBe(true);
    l.record("damage", { amount: 21 });
    expect(l.character.hp.current).toBe(90);
    expect(l.character.effects.some((e) => e.effect === "effect:protective-bond")).toBe(false);
    l.record("damage", { amount: 10, damageType: "fire" });
    expect(l.character.hp.current).toBe(80);
  });
  it("Voice of Authority: the reminder comes with a 1st-level spell, not a cantrip", () => {
    const l = make("class:cleric", 1, "subclass:order-domain");
    const sheet = derive(l.character, reg);
    const sp = sheet.spells.find((x) => x.level === 1 && x.ready !== "not prepared")!;
    const cantrip = sheet.spells.find((x) => x.level === 0)!;
    expect(l.record("castSpell", { spell: sp.id, list: sp.list.id, level: 1, using: "slot" }).join(" ")).toMatch(/Voice of Authority: if the spell targets an ally/);
    if (cantrip) expect(l.record("castSpell", { spell: cantrip.id, list: cantrip.list.id, level: 0, using: "slot" }).join(" ")).not.toMatch(/Voice of Authority/);
  });
});
