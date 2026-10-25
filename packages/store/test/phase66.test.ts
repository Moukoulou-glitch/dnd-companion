import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_803_000_000_000;

describe("13a: one Channel Divinity pool for a Cleric/Paladin", () => {
  const make = (paladinUsed = 0) => {
    const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: "class:cleric", abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 14 } }, reg);
    c.classes = [{ ...c.classes[0]!, level: 6 }, { ...c.classes[0]!, class: "class:paladin", level: 3, subclass: "subclass:devotion" }];
    if (paladinUsed) c.resourcesUsed["channel-divinity-paladin"] = paladinUsed;
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  const cd = (l: CharacterLog) => derive(l.character, reg).resources.find((r) => r.id === "channel-divinity")!;
  it("a paladin option and a cleric option spend the same two uses; a third is warned", () => {
    const l = make();
    const sacred = derive(l.character, reg).actions.find((a) => a.cost?.resource === "channel-divinity" && /Sacred Weapon/.test(a.name))!;
    l.record("useAction", { action: sacred.id });
    expect(cd(l).remaining).toBe(1);
    // Spent by its old name (the Play page's resource button): the shared pool.
    l.record("spendResource", { resource: "channel-divinity-paladin", amount: 1 });
    expect(cd(l).remaining).toBe(0);
    const res = l.record("spendResource", { resource: "channel-divinity", amount: 1 });
    expect(res.join(" ")).toMatch(/no uses left/);
    l.record("rest", { kind: "short" });
    expect(cd(l).remaining).toBe(2);
  });
  it("a use recorded under the paladin's pool before this change moves into the shared one", () => {
    const l = make(1);
    expect(cd(l).remaining).toBe(1);
    l.record("spendResource", { resource: "channel-divinity", amount: 1 });
    expect(l.character.resourcesUsed["channel-divinity-paladin"]).toBeUndefined();
    expect(cd(l).remaining).toBe(0);
  });
});
