import { describe, expect, it } from "vitest";
import { newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_808_000_000_000;
const make = (con = 14, extra: (c: ReturnType<typeof newCharacter>) => void = () => {}) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 14, con, int: 10, wis: 10, cha: 10 } }, reg);
  extra(c);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("13g in play", () => {
  it("holding your breath runs out into suffocating, which drops you to 0 hit points", () => {
    const l = make(14);
    l.record("useAction", { action: "common-hold-breath" });
    expect(l.character.effects.find((e) => e.effect === "effect:holding-breath")?.rounds).toBe(30);
    l.record("passTime", { minutes: 3 });
    expect(l.character.effects.find((e) => e.effect === "effect:suffocating")?.rounds).toBe(2);
    l.record("endTurn", {});
    l.record("endTurn", {});
    expect(l.character.hp.current).toBe(0);
  });
  it("ending it by hand doesn't start suffocating", () => {
    const l = make(14);
    l.record("useAction", { action: "common-hold-breath" });
    const id = l.character.effects.find((e) => e.effect === "effect:holding-breath")!.id;
    l.record("removeEffect", { instanceId: id });
    expect(l.character.effects.some((e) => e.effect === "effect:suffocating")).toBe(false);
  });
  it("surprised: a tag for your first turn; Alert can't be surprised", () => {
    const l = make();
    l.record("startCombat", { surprised: true });
    expect(l.character.effects.some((e) => e.effect === "effect:surprised")).toBe(true);
    l.record("endTurn", {});
    expect(l.character.effects.some((e) => e.effect === "effect:surprised")).toBe(false);
    const a = make(14, (c) => c.feats.push({ feat: "feat:alert", from: "Level 4 Ability Score Improvement" }));
    expect(a.record("startCombat", { surprised: true }).join(" ")).toMatch(/Alert: you aren't surprised/);
    expect(a.character.effects.some((e) => e.effect === "effect:surprised")).toBe(false);
  });
});
