import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_796_000_000_000;
const make = (race: string, level: number, choices: Record<string, Record<string, string[]>>, extra: Record<string, unknown> = {}) =>
  new CharacterLog(
    Character.parse({ id: "x", schemaVersion: 1, ruleset: "5e-2014", name: "X", abilities: { str: 15, dex: 12, con: 14, int: 10, wis: 13, cha: 16 }, race, classes: [{ class: "class:fighter", level }], choices, hp: { current: 40, temp: 0 }, ...extra }),
    reg,
    new HybridClock("t", () => (t += 1000)),
    "player",
  );

describe("9d fixes", () => {
  it("Chromatic Infusion: the picked type goes into the weapon's damage, typed, for 1 minute", () => {
    const l = make("race:human", 4, { "feat:gift-of-the-chromatic-dragon": {} }, { feats: [{ feat: "feat:gift-of-the-chromatic-dragon", from: "Level 4 Ability Score Improvement" }], inventory: [{ id: "ls", item: "item:longsword", quantity: 1, equipped: true, attuned: false }] });
    expect(l.record("useAction", { action: "gift-chromatic-infusion", choice: "fire" }).join(" ")).toMatch(/Chromatic Infusion: fire/);
    const e = l.character.effects.find((x) => x.effect === "other:chromatic-infusion");
    expect([e?.choice, e?.rounds]).toEqual(["fire", 10]);
    const s = derive(l.character, reg);
    const atk = s.attacks.find((x) => x.name === "Longsword")!;
    const inf = atk.damage.bonus.suggestions.find((x) => x.label === "Chromatic Infusion");
    expect(inf).toMatchObject({ apply: { dice: ["1d4"], damageType: "fire" }, preset: "always" });
  });
  it("Gift of the Gem Dragon: the DC uses the ability the feat raised, not the best one", () => {
    const l = make("race:human", 4, { "feat:gift-of-the-gem-dragon": { ability: ["wis"] } }, { feats: [{ feat: "feat:gift-of-the-gem-dragon", from: "Level 4 Ability Score Improvement" }] });
    const a = derive(l.character, reg).actions.find((x) => x.id === "gift-telekinetic-reprisal")!;
    // Wis 13 + human 1 + feat 1 = 15 (+2), not Cha 17 (+3): 8 + 2 + 2.
    expect(a.dc?.value).toBe(12);
  });
  it("Nathair's Mischief: the surge's d4 gives its result", () => {
    const l = make("race:human", 5, {});
    l.record("addEffect", { instanceId: "nm", effect: "effect:nathairs-mischief" });
    const surge = derive(l.character, reg).actions.find((x) => x.id === "nathairs-mischief-surge")!;
    expect(surge.roll?.text).toBe("1d4");
    expect(l.record("useAction", { action: "nathairs-mischief-surge", rolled: 4 }).join(" ")).toMatch(/Mischievous Surge 4: hovering molasses/);
  });
  it("Breath Weapon takes the place of one attack of the Attack action", () => {
    const l = make("race:chromatic-dragonborn", 5, { "race:chromatic-dragonborn": { ancestry: ["feature:ftd-chromatic-ancestry-red"] } });
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("useEconomy", { kind: "attack" });
    const notes = l.record("useAction", { action: "ftd-breath-red", rolled: 9 });
    expect(l.character.combat?.attacks).toBe(2);
    expect(l.character.combat?.action).toBe(1);
    expect(notes.join(" ")).not.toMatch(/attack 3/);
    expect(l.record("useAction", { action: "ftd-breath-red", rolled: 5 }).join(" ")).toMatch(/attack 3 of 2/);
  });
});
