import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_792_000_000_000;
const log = () => {
  // Dex 16 (human +1 = 17): +3, so a duplicate has AC 13.
  const c = newCharacter({ id: "m", name: "Mira", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 16, con: 14, int: 15, wis: 10, cha: 10 } }, reg);
  return new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
};
const mirror = (l: CharacterLog) => derive(l.character, reg).effects.find((e) => e.id === "effect:mirror-image");

describe("Mirror Image: duplicates counted", () => {
  it("starts with three, the d20 needed follows the count, and AC is 10 + Dex", () => {
    const l = log();
    l.record("addEffect", { instanceId: "mi", effect: "effect:mirror-image" });
    expect(l.character.effects[0]?.count).toBe(3);
    expect(mirror(l)?.counter).toEqual({ label: "Duplicates", left: 3, start: 3, need: 6, ac: 13, endsAtZero: true });
    expect(l.record("updateEffect", { instanceId: "mi", count: 2 }).join(" ")).toMatch(/2 duplicates left/);
    expect(mirror(l)?.counter?.need).toBe(8);
    l.record("updateEffect", { instanceId: "mi", count: 1 });
    expect(mirror(l)?.counter?.need).toBe(11);
  });
  it("the last one gone ends the spell; + puts one back but never above three", () => {
    const l = log();
    l.record("addEffect", { instanceId: "mi", effect: "effect:mirror-image" });
    l.record("updateEffect", { instanceId: "mi", count: 9 });
    expect(l.character.effects[0]?.count).toBe(3);
    l.record("updateEffect", { instanceId: "mi", count: 1 });
    expect(l.record("updateEffect", { instanceId: "mi", count: 2 }).join(" ")).toMatch(/back to 2/);
    expect(l.record("updateEffect", { instanceId: "mi", count: 0 }).join(" ")).toMatch(/Mirror Image ends/);
    expect(l.character.effects).toHaveLength(0);
  });
  it("an older save without a count reads as all three", () => {
    const l = log();
    l.record("addEffect", { instanceId: "mi", effect: "effect:mirror-image" });
    delete (l.character.effects[0] as { count?: number }).count;
    expect(mirror(l)?.counter?.left).toBe(3);
  });
});
