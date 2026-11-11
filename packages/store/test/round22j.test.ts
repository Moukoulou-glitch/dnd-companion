import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_891_000_000_000;
const cleric = (level = 12) => {
  const c = newCharacter({ id: "c", name: "C", race: "race:human", class: "class:cleric", abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 12 } }, reg);
  c.classes = [{ class: "class:cleric", level }];
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const di = (l: CharacterLog) => derive(l.character, reg).resources.find((r) => r.id === "divine-intervention")!;

describe("22j: Divine Intervention, an action with a use to track", () => {
  it("an action that spends its one use", () => {
    const l = cleric();
    const a = derive(l.character, reg).actions.find((x) => x.id === "divine-intervention")!;
    expect(a.economy).toBe("action");
    expect(a.cost?.resource).toBe("divine-intervention");
    expect(di(l)).toMatchObject({ max: 1, used: 0 });
    l.record("useAction", { action: "divine-intervention", rolled: 80 });
    expect(di(l).used).toBe(1);
  });
  it("it failed (over your cleric level): back after a long rest", () => {
    const l = cleric();
    l.record("useAction", { action: "divine-intervention", rolled: 80 });
    expect(l.character.resourceHolds).toBeUndefined();
    l.record("rest", { kind: "long" });
    expect(di(l).used).toBe(0);
  });
  it("your deity answered: not back with a rest for 7 days; back once the days pass, or by hand", () => {
    const l = cleric();
    expect(l.record("useAction", { action: "divine-intervention", rolled: 5 }).join(" ")).toMatch(/not again for 7 days/);
    expect(l.character.resourceHolds?.["divine-intervention"]?.from).toBe("Divine Intervention");
    expect(l.record("rest", { kind: "long" }).join(" ")).toMatch(/not back with the rest/);
    expect(di(l).used).toBe(1);
    // Six more days and a bit: the clock passes the seventh day.
    l.record("passTime", { minutes: 6 * 1440 + 960 });
    expect(di(l).used).toBe(0);
    expect(l.character.resourceHolds).toBeUndefined();
    // Again, then restored by hand.
    l.record("useAction", { action: "divine-intervention", rolled: 3 });
    l.record("restoreResource", { resource: "divine-intervention", amount: 1 });
    expect(l.character.resourceHolds).toBeUndefined();
    expect(di(l).used).toBe(0);
  });
  it("20th level: it always works, so it always waits", () => {
    const l = cleric(20);
    l.record("useAction", { action: "divine-intervention-sure" });
    expect(l.character.resourceHolds?.["divine-intervention"]).toBeDefined();
  });
});

describe("22j: Ring of the Great Pine Cone, Nature's Embrace", () => {
  it("opens the summon of three dryads", () => {
    const def = reg.find("summon:pine-cone-dryads", "summon")!;
    expect(def.creatures).toEqual(["creature:dryad"]);
    expect(def.count).toEqual({ "1": 3 });
    const ring = reg.find("item:ring-of-the-great-pine-cone", "item")!;
    expect(ring.grant?.actions?.find((a) => a.id === "pine-cone-embrace")?.opensSummon).toEqual({ summon: "summon:pine-cone-dryads" });
  });
});
