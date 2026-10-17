import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_890_000_000_000;
const ranger = () => {
  const c = newCharacter({ id: "r", name: "R", race: "race:human", class: "class:ranger", abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 14, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 3, subclass: "subclass:drakewarden" };
  const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  l.record("summonCompanion", { companion: "drake", form: "lightning" });
  return l;
};
const drake = (l: CharacterLog) => derive(l.character, reg).companions.find((x) => x.id === "drake")!;

describe("8k: the Drake Companion", () => {
  it("a lightning drake is immune to lightning; other damage hurts", () => {
    const l = ranger();
    expect(drake(l).form!.defenses.immune).toEqual(["lightning"]);
    const max = drake(l).form!.hpMax.total;
    const n = l.record("damage", { amount: 9, companion: "drake", damageType: "lightning" });
    expect(drake(l).form!.hp.current).toBe(max);
    expect(n.join(" ")).toMatch(/Immune to lightning: no damage/);
    l.record("damage", { amount: 4, companion: "drake", damageType: "slashing" });
    expect(drake(l).form!.hp.current).toBe(max - 4);
  });
  it("Infused Strikes: 1d6 of its essence, with its reaction", () => {
    const r = drake(ranger()).form!.rolls;
    expect(r).toEqual([expect.objectContaining({ name: "Infused Strikes", dice: "1d6", damageType: "lightning", economy: "reaction" })]);
  });
  it("a companion made from a creature keeps its immunities (an Imp: fire and poison)", async () => {
    const { companionFromCreature } = await import("@dnd/engine");
    const l = ranger();
    l.record("setCustomCompanion", { companion: { id: "i", name: "Imp", kind: "Imp", notes: "", ...companionFromCreature(reg.find("creature:imp", "creature")!) } });
    const imp = derive(l.character, reg).companions.find((x) => x.name === "Imp")!;
    expect(imp.form!.defenses.immune).toEqual(expect.arrayContaining(["fire", "poison"]));
    const n = l.record("damage", { amount: 6, companion: imp.id, damageType: "fire" });
    expect(n.join(" ")).toMatch(/Immune to fire/);
  });
});
