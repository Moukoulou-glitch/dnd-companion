import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_899_100_000_000;

describe("23q: Twilight Sanctuary", () => {
  const pc = () => {
    const c = newCharacter({ id: "tw", name: "Tw", race: "race:human", class: "class:cleric", abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
    c.classes = [{ class: "class:cleric", level: 4, subclass: "subclass:twilight-domain" }];
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("lasts 10 rounds, counting down with your turns", () => {
    const l = pc();
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("useAction", { action: "twilight-sanctuary" });
    const timer = l.character.effects.find((e) => e.toggles?.includes("twilight-sanctuary"))!;
    expect(timer.rounds).toBe(10);
    expect(timer.minutes).toBeUndefined();
    l.record("endTurn", {});
    expect(l.character.effects.find((e) => e.id === timer.id)?.rounds).toBe(9);
  });
  it("its end-of-turn benefit has no once-a-turn limit", () => {
    const l = pc();
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("useAction", { action: "twilight-sanctuary" });
    const s = derive(l.character, reg);
    const a = s.actions.find((x) => x.id === "twilight-sanctuary-turn")!;
    expect(a.anyTimes).toBe(true);
  });
});
