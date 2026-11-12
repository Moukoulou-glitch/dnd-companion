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

describe("22s: a spell slot instead of the free use", () => {
  const pc = (cls: string, level: number, subclass: string) => {
    const c = newCharacter({ id: "q", name: "Q", race: "race:human", class: cls, abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 16 } }, reg);
    c.classes = [{ class: cls, level, subclass }];
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("Universal Speech, Eyes of Night, Animating Performance, Performance of Creation, Mantle of Majesty", () => {
    const l = pc("class:bard", 6, "subclass:college-of-eloquence");
    const a = derive(l.character, reg).actions.find((x) => x.id === "universal-speech-slot")!;
    expect(a.choose?.options[0]).toBe("1st-level slot");
    l.record("useAction", { action: "universal-speech-slot", choice: "2nd-level slot" });
    expect(l.character.slotsUsed["2"]).toBe(1);
    expect(derive(pc("class:bard", 6, "subclass:college-of-creation").character, reg).actions.find((x) => x.id === "animating-performance-slot")?.choose?.options[0]).toBe("3rd-level slot");
    expect(derive(pc("class:bard", 3, "subclass:college-of-creation").character, reg).actions.find((x) => x.id === "performance-of-creation-slot")?.choose?.options[0]).toBe("2nd-level slot");
    expect(derive(pc("class:bard", 6, "subclass:college-of-glamour").character, reg).actions.some((x) => x.id === "mantle-of-majesty-slot")).toBe(true);
    expect(derive(pc("class:cleric", 1, "subclass:twilight-domain").character, reg).actions.some((x) => x.id === "eyes-of-night-slot")).toBe(true);
  });
  it("Elder Champion's 10 hit points at the start of your turn; the Chime of Opening's charge", () => {
    expect(derive(pc("class:paladin", 20, "subclass:oath-of-the-ancients").character, reg).actions.find((x) => x.id === "elder-champion-regain")?.heal?.text).toBe("10");
    expect(derive(withItem("item:chime-of-opening").character, reg).actions.find((x) => x.id === "chime-of-opening")?.charges?.amount).toBe(1);
  });
});

describe("22s: Dragon Fear spends a Breath Weapon use", () => {
  const dragonborn = (race: string) => {
    const c = newCharacter({ id: "d", name: "D", race, class: "class:fighter", abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 14 } }, reg);
    c.classes = [{ class: "class:fighter", level: 4 }];
    c.feats.push({ feat: "feat:dragon-fear", from: "Fighter 4 (Ability Score Improvement)" });
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("the Player's Handbook dragonborn's, or Fizban's", () => {
    for (const [race, pool] of [["race:dragonborn", "breath-weapon"], ["race:chromatic-dragonborn", "ftd-breath-weapon"]] as const) {
      const l = dragonborn(race);
      expect(derive(l.character, reg).actions.find((a) => a.id === "dragon-fear")?.cost?.resource).toBe(pool);
      l.record("useAction", { action: "dragon-fear" });
      expect(l.character.resourcesUsed[pool]).toBe(1);
    }
  });
});
