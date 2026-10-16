import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../../store/src/log.js";
import { HybridClock } from "../../store/src/clock.js";
import { turnOrder } from "../src/components/Combat";

const reg = tableRegistry();
let t = 1_850_000_000_000;

describe("Turn order on the combat card", () => {
  it("highest first; those that act with you are listed with you; unknown initiatives last", () => {
    const c = newCharacter({ id: "d", name: "D", race: "race:human", class: "class:druid", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 2, subclass: "subclass:circle-of-wildfire" };
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("setCompanion", { companion: "wildfire-spirit", form: "wildfire-spirit" });
    const pet = { id: "p", name: "Grey", kind: "Pet", size: "Medium" as const, type: "beast", ac: 13, hpMax: 11, speed: "40 ft.", abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, traits: [], attacks: [], notes: "" };
    l.record("setCustomCompanion", { companion: pet });
    l.record("setCustomCompanion", { companion: { ...pet, id: "q", name: "Mule" } });
    l.record("startCombat", {});
    l.record("setInitiative", { value: 14 });
    l.record("companionInitiative", { companion: "custom-p", value: 18 });
    const order = turnOrder(l.character, derive(l.character, reg), reg);
    expect(order.map((x) => [x.name, x.initiative])).toEqual([
      ["Grey", 18],
      ["You", 14],
      ["Mule", undefined],
    ]);
    expect(order[1]!.with).toEqual(["Wildfire Spirit (right after)"]);
  });
});
