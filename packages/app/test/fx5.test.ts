import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../../store/src/log.js";
import { HybridClock } from "../../store/src/clock.js";
import { formFx, mainType, ongoingFx, opFx, rollFx } from "../src/fx/triggers.js";
import { CHARM_SPELLS, DAMAGE_FX, FORM_FX, damageKey } from "../src/fx/looks.js";
import { SPELL_FX } from "../src/fx/spells.js";
import { specOf } from "../src/fx/FxLayer.js";
import type { RollRecord } from "../src/rolls.js";

const reg = tableRegistry();
let t = 1_799_000_000_000;
const make = (race: string, cls: string, level: number, subclass?: string) => {
  const c = newCharacter({ id: "x", name: "X", race, class: cls, abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 16 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, ...(subclass ? { subclass } : {}) };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const fx = (l: CharacterLog, type: string, payload: unknown) => {
  const before = l.character;
  l.record(type as never, payload as never);
  return opFx(type, payload, before, l.character, (id) => (reg.find(id, "spell") as { school?: string } | undefined)?.school);
};
const dmg = (r: Partial<RollRecord>): RollRecord => ({ id: "r", at: 0, title: "", kind: "damage", total: 0, crit: false, fumble: false, physical: false, lines: [], ...r });

describe("Damage types", () => {
  it("a damage roll plays its main type: the one with the most damage", () => {
    expect(rollFx(dmg({ byType: { fire: 9 } }))).toEqual([{ kind: "damage-type", type: "fire" }]);
    expect(mainType(dmg({ byType: { slashing: 6, necrotic: 5 } }))).toBe("slashing");
    expect(mainType(dmg({ byType: { slashing: 3, necrotic: 5 } }))).toBe("necrotic");
    // Names as the content writes them; something that isn't a damage type plays nothing.
    expect(damageKey("Fire damage")).toBe("fire");
    expect(rollFx(dmg({ byType: { damage: 7 } }))).toEqual([]);
    // Your own dice as a total: the first (weapon's or spell's) type.
    expect(rollFx(dmg({ physical: true, mainType: "cold" }))).toEqual([{ kind: "damage-type", type: "cold" }]);
  });

  it("every damage type has a look with a name, so colour is never the only signal", () => {
    expect(Object.keys(DAMAGE_FX).sort()).toEqual(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"]);
    for (const type of Object.keys(DAMAGE_FX)) {
      const s = specOf({ kind: "damage-type", type });
      expect(s.label).toBeTruthy();
      expect(s.look).toContain(`fx-dmg-${DAMAGE_FX[type]!.shape}`);
    }
  });

  it("a spell's own look or Sneak Attack wins over the type's (one effect per roll)", () => {
    expect(rollFx(dmg({ spell: "spell:moonbeam", byType: { radiant: 10 } }))).toEqual([{ kind: "spell", spell: "spell:moonbeam", phase: "resolve" }]);
    expect(rollFx(dmg({ byType: { piercing: 9 }, lines: [{ source: "Sneak Attack", detail: "3+3", total: 6 }] }))).toEqual([{ kind: "sneak" }]);
  });

  it("taking typed damage that all got through plays its type on the HP box; untyped or stopped damage doesn't", () => {
    const l = make("race:human", "class:fighter", 5);
    expect(fx(l, "damage", { amount: 4, damageType: "fire" })).toEqual([{ kind: "hurt", type: "fire", amount: 4 }]);
    expect(fx(l, "damage", { amount: 3 })).toEqual([]);
    l.record("setDefense", { kind: "resist", value: "cold", on: true });
    expect(fx(l, "damage", { amount: 6, damageType: "cold" })).toEqual([{ kind: "defend", how: "reduced", amount: 3 }]);
    // At 0 HP nothing more plays.
    l.record("damage", { amount: 999 });
    expect(fx(l, "damage", { amount: 4, damageType: "fire" }).filter((e) => e.kind === "hurt")).toEqual([]);
  });
});

describe("Charm", () => {
  it("spells that charm get the charm look when cast", () => {
    for (const id of CHARM_SPELLS) expect(SPELL_FX[id]?.family).toBe("charm");
    const l = make("race:human", "class:wizard", 3);
    l.record("learnSpell", { spell: "spell:charm-person", list: "wizard" });
    expect(fx(l, "castSpell", { spell: "spell:charm-person", list: "wizard", level: 1, using: "slot" })).toEqual([{ kind: "spell", spell: "spell:charm-person", phase: "cast" }]);
    // Sleep is an enchantment but doesn't charm: the ordinary circle.
    expect(fx(l, "castSpell", { spell: "spell:sleep", list: "wizard", level: 1, using: "slot" })[0]).toMatchObject({ kind: "cast" });
  });

  it("the Charmed condition plays when it lands on you, not again while it's there, and not when it ends", () => {
    const l = make("race:human", "class:fighter", 3);
    expect(fx(l, "addEffect", { instanceId: "c1", effect: "condition:charmed" })).toEqual([{ kind: "charmed" }]);
    expect(fx(l, "addEffect", { instanceId: "c2", effect: "condition:charmed" })).toEqual([]);
    expect(fx(l, "removeEffect", { instanceId: "c1" })).toEqual([]);
    expect(specOf({ kind: "charmed" })).toMatchObject({ at: "edge", label: "Charmed" });
  });
});

describe("Necrotic Shroud and Form of Dread", () => {
  it("Necrotic Shroud: the start plays when it's used, the loop follows its state until it ends", () => {
    const l = make("race:fallen-aasimar", "class:fighter", 3);
    expect(formFx(l.character)).toEqual([]);
    const e = fx(l, "useAction", { action: "necrotic-shroud" });
    expect(e).toContainEqual({ kind: "form", form: "necrotic-shroud" });
    expect(formFx(l.character)).toEqual([{ form: "necrotic-shroud", look: FORM_FX["necrotic-shroud"]!.ongoing }]);
    // Nothing replays on later changes while it's on.
    expect(fx(l, "damage", { amount: 1 }).some((x) => x.kind === "form")).toBe(false);
    // A long rest ends it (as the engine says): the loop goes.
    l.record("rest", { kind: "long" });
    expect(formFx(l.character)).toEqual([]);
  });

  it("Form of Dread: its start, with the temporary hit points it gives, and the loop while it lasts", () => {
    const l = make("race:human", "class:warlock", 3, "subclass:the-undead");
    const e = fx(l, "useAction", { action: "form-of-dread", rolled: 9 });
    expect(e).toContainEqual({ kind: "form", form: "form-of-dread" });
    expect(e).toContainEqual({ kind: "temp", amount: 9 });
    expect(formFx(l.character).map((x) => x.form)).toEqual(["form-of-dread"]);
    expect(specOf({ kind: "form", form: "form-of-dread" })).toMatchObject({ at: "edge", label: "Form of Dread" });
  });

  it("the concentration loop and a form's loop are separate", () => {
    const l = make("race:fallen-aasimar", "class:fighter", 3);
    l.record("useAction", { action: "necrotic-shroud" });
    expect(ongoingFx(l.character)).toBeUndefined();
    expect(formFx(l.character)).toHaveLength(1);
  });
});
