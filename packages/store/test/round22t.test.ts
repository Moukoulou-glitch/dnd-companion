import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_896_000_000_000;

describe("22t: Call the Hunt's temporary HP", () => {
  const beast = (con: number) => {
    const c = newCharacter({ id: "b", name: "B", race: "race:human", class: "class:barbarian", abilities: { str: 16, dex: 12, con, int: 8, wis: 10, cha: 10 } }, reg);
    c.classes = [{ class: "class:barbarian", level: 14, subclass: "subclass:path-of-the-beast" }];
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("offers up to your Constitution modifier (minimum 1) allies and gives 5 temporary HP each", () => {
    const l = beast(16); // 17 with the human's +1: +3
    const a = derive(l.character, reg).actions.find((x) => x.id === "call-the-hunt")!;
    expect(a.choose?.options).toEqual(["1 ally", "2 allies", "3 allies"]);
    l.record("useAction", { action: "call-the-hunt", choice: "3 allies" });
    expect(l.character.hp.temp).toBe(15);
    expect(l.character.resourcesUsed["call-the-hunt"]).toBe(1);
    expect(derive(beast(8).character, reg).actions.find((x) => x.id === "call-the-hunt")?.choose?.options).toEqual(["1 ally"]);
  });
  it("doesn't lower temporary HP you already have", () => {
    const l = beast(14);
    l.character.hp.temp = 20;
    expect(l.record("useAction", { action: "call-the-hunt", choice: "2 allies" }).join(" ")).toMatch(/don't stack/);
    expect(l.character.hp.temp).toBe(20);
  });
});

describe("22t: Spirit Totem's bear spirit", () => {
  it("gives 5 + druid level temporary HP", () => {
    const c = newCharacter({ id: "s", name: "S", race: "race:human", class: "class:druid", abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
    c.classes = [{ class: "class:druid", level: 6, subclass: "subclass:circle-of-the-shepherd" }];
    const a = derive(c, reg).actions.find((x) => x.id === "spirit-totem-bear")!;
    expect(a.tempHp?.text).toBe("11");
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.record("useAction", { action: "spirit-totem-bear", rolled: 11 });
    expect(l.character.hp.temp).toBe(11);
  });
});
