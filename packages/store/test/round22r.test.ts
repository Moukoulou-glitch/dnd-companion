import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_895_000_000_000;
const withItem = (item: string, quantity = 1, attuned = false) => {
  const c = newCharacter({ id: "p", name: "P", race: "race:human", class: "class:fighter", abilities: { str: 14, dex: 14, con: 14, int: 12, wis: 12, cha: 12 } }, reg);
  c.classes = [{ class: "class:fighter", level: 5 }];
  c.inventory.push({ id: "it", item, quantity, equipped: true, attuned });
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("22r: magic item fixes", () => {
  it("a Figurine can't be used again until its days pass (rests don't bring it back)", () => {
    const l = withItem("item:figurine-of-wondrous-power-onyx-dog");
    l.record("useAction", { action: "figurine-onyx-dog" });
    const r = () => derive(l.character, reg).resources.find((x) => x.id === "figurine-onyx-dog")!;
    expect(r().used).toBe(1);
    expect(l.character.resourceHolds?.["figurine-onyx-dog"]).toBeDefined();
    l.record("rest", { kind: "long" });
    expect(r().used).toBe(1);
    l.record("passTime", { minutes: 7 * 1440 });
    expect(r().used).toBe(0);
  });
  it("an elemental gem is used up when broken", () => {
    const l = withItem("item:elemental-gem-red-corundum", 2);
    expect(l.record("useAction", { action: "elemental-gem-red-corundum" }).join(" ")).toMatch(/used up: 1 left/);
    expect(l.character.inventory.find((i) => i.id === "it")?.quantity).toBe(1);
    l.record("useAction", { action: "elemental-gem-red-corundum" });
    expect(l.character.inventory.some((i) => i.id === "it")).toBe(false);
  });
  it("the Horn of Silent Alarm spends a charge", () => {
    const l = withItem("item:horn-of-silent-alarm");
    const a = derive(l.character, reg).actions.find((x) => x.id === "horn-of-silent-alarm")!;
    expect(a.charges?.amount).toBe(1);
  });
});
