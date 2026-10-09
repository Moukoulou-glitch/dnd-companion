import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../../store/src/log.js";
import { HybridClock } from "../../store/src/clock.js";
import { ongoingFx, opFx, rollFx, strikeFx } from "../src/fx/triggers.js";
import { SPELL_FX } from "../src/fx/spells.js";
import type { RollRecord } from "../src/rolls.js";

const reg = tableRegistry();
let t = 1_794_000_000_000;
const fighter = () => {
  const c = newCharacter({ id: "f", name: "F", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
/** Records an operation the way the app does and returns the effects it earns. */
const fx = (l: CharacterLog, type: string, payload: unknown) => {
  const before = l.character;
  l.record(type as never, payload as never);
  return opFx(type, payload, before, l.character, (id) => (reg.find(id, "spell") as { school?: string } | undefined)?.school);
};
const roll = (r: Partial<RollRecord>): RollRecord => ({ id: "r", at: 0, title: "", kind: "d20", total: 0, crit: false, fumble: false, physical: false, lines: [], ...r });

describe("Effect triggers", () => {
  it("crit and natural 1 only on attack rolls, from the roll itself", () => {
    expect(rollFx(roll({ attack: true, natural: 20, crit: true }))).toEqual([{ kind: "crit" }]);
    // Champion's 19 is a crit too: the roll says so.
    expect(rollFx(roll({ attack: true, natural: 19, crit: true }))).toEqual([{ kind: "crit" }]);
    expect(rollFx(roll({ attack: true, natural: 1, fumble: true }))).toEqual([{ kind: "fumble" }]);
    // A high total isn't a crit; a natural 20 on a check or save isn't an attack.
    expect(rollFx(roll({ attack: true, natural: 15, total: 32 }))).toEqual([]);
    expect(rollFx(roll({ natural: 20, crit: true }))).toEqual([]);
    expect(rollFx(roll({ natural: 1, fumble: true }))).toEqual([]);
  });

  it("Sneak Attack only when its dice are in the damage", () => {
    expect(rollFx(roll({ kind: "damage", lines: [{ source: "Weapon", detail: "4", total: 4 }, { source: "Sneak Attack", detail: "3+5", total: 8 }] }))).toEqual([{ kind: "sneak" }]);
    expect(rollFx(roll({ kind: "damage", lines: [{ source: "Weapon", detail: "4", total: 4 }] }))).toEqual([]);
  });

  it("healing shows what was actually healed, capped at the maximum; none when nothing changed", () => {
    const l = fighter();
    const max = l.character.hp!.current;
    fx(l, "damage", { amount: 5 });
    expect(fx(l, "heal", { amount: 20 })).toEqual([{ kind: "heal", amount: 5 }]);
    expect(l.character.hp!.current).toBe(max);
    expect(fx(l, "heal", { amount: 4 })).toEqual([]);
    // Healing a companion isn't yours.
    expect(fx(l, "setTempHp", { amount: 6 })).toEqual([{ kind: "temp", amount: 6 }]);
    expect(fx(l, "setTempHp", { amount: 3 })).toEqual([]);
  });

  it("damage prevention: blocked, reduced or absorbed, and only when it really happened", () => {
    const l = fighter();
    expect(fx(l, "damage", { amount: 4 })).toEqual([]);
    l.record("setDefense", { kind: "resist", value: "fire", on: true });
    l.record("setDefense", { kind: "immune", value: "poison", on: true });
    expect(fx(l, "damage", { amount: 6, damageType: "fire" })).toEqual([{ kind: "defend", how: "reduced", amount: 3 }]);
    expect(fx(l, "damage", { amount: 6, damageType: "poison" })).toEqual([{ kind: "defend", how: "prevented", amount: 6 }]);
    l.record("setTempHp", { amount: 5 });
    expect(fx(l, "damage", { amount: 3 })).toEqual([{ kind: "defend", how: "absorbed", amount: 3 }]);
    expect(fx(l, "damage", { amount: 4 })).toEqual([{ kind: "defend", how: "absorbed", amount: 2 }]);
  });

  it("death saves: each one recorded at 0 HP, the third marked final", () => {
    const l = fighter();
    l.record("damage", { amount: l.character.hp!.current });
    expect(fx(l, "deathSave", { result: "failure" })).toEqual([{ kind: "death-save", result: "failure", final: false }]);
    expect(fx(l, "deathSave", { result: "success" })).toEqual([{ kind: "death-save", result: "success", final: false }]);
    expect(fx(l, "deathSave", { result: "critFailure" })).toEqual([{ kind: "death-save", result: "failure", final: true }]);
    const k = fighter();
    k.record("damage", { amount: k.character.hp!.current });
    // A natural 20 brings you back: that's healing, not a death-save tick.
    expect(fx(k, "deathSave", { result: "critSuccess" })).toEqual([{ kind: "heal", amount: 1 }]);
  });

  it("Inspiration and level-up only when they change; spells get their real school", () => {
    const l = fighter();
    expect(fx(l, "setInspiration", { count: 1 })).toEqual([{ kind: "inspiration", gained: true }]);
    expect(fx(l, "setInspiration", { count: 1 })).toEqual([]);
    expect(fx(l, "setInspiration", { count: 0 })).toEqual([{ kind: "inspiration", gained: false }]);
    expect(fx(l, "levelUp", { class: "class:fighter", hpRoll: 6 })).toEqual([{ kind: "level-up", level: 2 }]);
    const c: Character = l.character;
    expect(opFx("castSpell", { spell: "spell:fireball" }, c, c, (id) => (reg.find(id, "spell") as { school?: string } | undefined)?.school)).toEqual([{ kind: "cast", school: "evocation" }]);
    expect(opFx("castSpell", { spell: "spell:nothing-known" }, c, c, () => undefined)).toEqual([{ kind: "cast" }]);
  });
});

describe("Spell phases and unarmed strikes", () => {
  it("a spell with its own look plays its cast once; later uses play the short version; others keep the circle", () => {
    const l = fighter();
    const c = l.character;
    expect(opFx("castSpell", { spell: "spell:call-lightning" }, c, c)).toEqual([{ kind: "spell", spell: "spell:call-lightning", phase: "cast" }]);
    expect(opFx("castSpell", { spell: "spell:fireball" }, c, c, () => "evocation")).toEqual([{ kind: "cast", school: "evocation" }]);
    // Call Lightning: the next bolt (from the concentration chip) is "again", never the whole storm.
    const dmg = (x: Partial<RollRecord>) => roll({ kind: "damage", lines: [{ source: "Call Lightning", detail: "3+4+5", total: 12 }], ...x });
    expect(rollFx(dmg({ spell: "spell:call-lightning", again: true }))).toEqual([{ kind: "spell", spell: "spell:call-lightning", phase: "again" }]);
    // Its damage right after casting has no separate look (the cast already struck).
    expect(rollFx(dmg({ spell: "spell:call-lightning" }))).toEqual([]);
    // Moonbeam: a pulse both right after casting and on later turns.
    expect(rollFx(dmg({ spell: "spell:moonbeam" }))).toEqual([{ kind: "spell", spell: "spell:moonbeam", phase: "resolve" }]);
    expect(rollFx(dmg({ spell: "spell:moonbeam", again: true }))).toEqual([{ kind: "spell", spell: "spell:moonbeam", phase: "again" }]);
    expect(rollFx(dmg({ spell: "spell:fireball" }))).toEqual([]);
  });

  it("the ongoing loop follows the engine's concentration and nothing else", () => {
    const l = fighter();
    expect(ongoingFx(l.character)).toBeUndefined();
    const on = { ...l.character, concentration: { spell: "spell:moonbeam", name: "Moonbeam", rounds: 10 } };
    expect(ongoingFx(on)).toEqual({ spell: "spell:moonbeam", look: "sfx-ongoing-moon" });
    // A concentration spell with no loop of its own shows nothing.
    expect(ongoingFx({ ...on, concentration: { spell: "spell:bless", name: "Bless" } })).toBeUndefined();
    // Every phase in the registry names a look and a length.
    for (const [id, d] of Object.entries(SPELL_FX)) {
      expect(id.startsWith("spell:")).toBe(true);
      for (const p of [d.cast, d.again, d.resolve]) if (p) expect(p.look && p.ms > 0 && p.ms <= 1200).toBeTruthy();
    }
  });

  it("unarmed strikes: impact on a hit, bigger on a crit, only a trail on a miss; other attacks nothing", () => {
    expect(strikeFx("martial-arts", "hit")).toEqual([{ kind: "unarmed", result: "hit" }]);
    expect(strikeFx("martial-arts-bonus", "crit")).toEqual([{ kind: "unarmed", result: "crit" }]);
    expect(strikeFx("tavern-unarmed", "miss")).toEqual([{ kind: "unarmed", result: "miss" }]);
    expect(strikeFx("unarmed-fighting-free-hands", "hit")).toEqual([{ kind: "unarmed", result: "hit" }]);
    expect(strikeFx("item:shortsword", "hit")).toEqual([]);
  });
});
