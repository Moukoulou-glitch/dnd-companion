import { describe, expect, it } from "vitest";
import { derive, newCharacter, summonBlock } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 2_400_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
const druid = () => {
  const c = newCharacter({ id: "d", name: "Yoyo", race: "race:dragonborn", class: "class:druid", abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 8 };
  c.hp.current = derive(c, reg).hpMax.total;
  c.spells.push({ spell: "spell:shillelagh", list: "druid", prepared: true } as Character["spells"][number]);
  c.inventory.push({ id: "club1", item: "item:club", quantity: 1 } as Character["inventory"][number], { id: "sc1", item: "item:scimitar", quantity: 1 } as Character["inventory"][number]);
  return logOf(c);
};

describe("Pass Without Trace, Shillelagh, Hex, timers, concentration on summons", () => {
  it("Pass Without Trace adds 10 to Stealth with a timer", () => {
    const log = druid();
    const before = derive(log.character, reg).skills.stealth.total;
    log.record("castSpell", { spell: "spell:pass-without-trace", list: "druid", level: 2, using: "slot", selfEffect: true });
    const s = derive(log.character, reg);
    expect(s.skills.stealth.total).toBe(before + 10);
    expect(s.effects.find((e) => e.id === "effect:pass-without-trace")).toMatchObject({ minutes: 60 });
  });

  it("Shillelagh is an option on melee weapon rolls: Wisdom and a d8, a scimitar flagged", () => {
    const log = druid();
    log.record("castSpell", { spell: "spell:shillelagh", list: "druid", level: 0, using: "none", selfEffect: true });
    const atk = derive(log.character, reg).attacks;
    const club = atk.find((a) => a.name === "Club" && !a.offHand)!;
    expect(club.ability).toBe("str");
    expect(club.attack.suggestions.find((x) => x.label === "Shillelagh")!.apply.flat).toBe(2);
    expect(club.damage.bonus.suggestions.find((x) => x.label === "Shillelagh")!.apply).toMatchObject({ flat: 2, weaponDice: "1d8" });
    const scim = atk.find((a) => a.name === "Scimitar" && !a.offHand)!;
    expect(scim.attack.suggestions.find((x) => x.label === "Shillelagh")!.reason).toMatch(/Not a club or quarterstaff/);
  });

  it("Hex keeps its ability; Alarm leaves a timer tag each time; Plant Growth over 8 hours takes no action", () => {
    const log = druid();
    log.record("addEffect", { instanceId: "h", effect: "effect:hex", choice: "wis" });
    const hex = derive(log.character, reg).effects.find((e) => e.id === "effect:hex")!;
    expect(hex.choice).toMatchObject({ value: "wis", options: ["str", "dex", "con", "int", "wis", "cha"] });
    log.record("castSpell", { spell: "spell:speak-with-animals", list: "druid", level: 1, using: "ritual", selfEffect: false });
    log.record("castSpell", { spell: "spell:speak-with-animals", list: "druid", level: 1, using: "ritual", selfEffect: false });
    expect(derive(log.character, reg).effects.filter((e) => e.name === "Speak with Animals").map((e) => e.minutes)).toEqual([10, 10]);
    log.record("startCombat", {});
    log.record("startTurn", {});
    log.record("castSpell", { spell: "spell:plant-growth", list: "druid", level: 3, using: "slot", selfEffect: false, castingTime: "8 hours" });
    expect(log.character.combat!.action).toBe(0);
  });

  it("a summoned creature's new concentration ends the old one's effect on it", () => {
    const log = druid();
    log.record("summon", { spell: "spell:conjure-woodland-beings", group: "g", creatures: [{ creature: "creature:dryad", count: 1 }] });
    const id = log.character.summons[0]!.id;
    log.record("summonEffect", { id, effect: "effect:barkskin", add: true, rounds: 600 });
    log.record("summonCast", { id, spell: "Barkskin", economy: "action", concentration: true });
    log.record("summonEffect", { id, effect: "effect:pass-without-trace", add: true, rounds: 600 });
    log.record("summonCast", { id, spell: "Pass Without Trace", economy: "none", concentration: true });
    expect(log.character.summons[0]!.effects!.map((e) => e.effect)).toEqual(["effect:pass-without-trace"]);
    expect(summonBlock(reg, log.character.summons[0]!)!.skills.stealth.total).toBe(15);
  });
});
