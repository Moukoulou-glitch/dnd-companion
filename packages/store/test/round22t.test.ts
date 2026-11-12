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

describe("22u: uses that had nothing to spend them", () => {
  const pc = (cls: string, level: number, extra: (c: ReturnType<typeof newCharacter>) => void, race = "race:human") => {
    const c = newCharacter({ id: "u", name: "U", race, class: cls, abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 12, cha: 16 } }, reg);
    c.classes = [{ class: cls, level }];
    extra(c);
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("Spell Sniper's steady aim and Gift of the Protectors spend their use", () => {
    const l = pc("class:wizard", 4, (c) => c.feats.push({ feat: "feat:spell-sniper", from: "Wizard 4 (Ability Score Improvement)" }));
    l.record("useAction", { action: "spell-sniper-aim" });
    expect(l.character.resourcesUsed["spell-sniper-aim"]).toBe(1);
    const w = pc("class:warlock", 9, (c) => {
      c.choices["feature:pact-boon"] = { option: ["feature:pact-of-the-tome"] };
      c.choices["feature:eldritch-invocations"] = { invocations: ["feature:invocation-gift-of-the-protectors"] };
    });
    w.record("useAction", { action: "gift-of-the-protectors" });
    expect(w.character.resourcesUsed["gift-of-the-protectors"]).toBe(1);
  });
  it("Fury of the Small's damage spends its use when ticked", () => {
    const s = derive(pc("class:fighter", 3, (c) => c.inventory.push({ id: "w", item: "item:shortsword", quantity: 1, equipped: true, attuned: false }), "race:goblin").character, reg);
    const fury = s.attacks.find((a) => /Shortsword/.test(a.name))?.damage.bonus.suggestions.find((x) => x.label === "Fury of the Small");
    expect(fury?.spends?.resource).toBe("fury-of-the-small");
  });
});

describe("22v: Unicorn Spirit and Grim Harvest", () => {
  it("the unicorn heals your druid level; Grim Harvest heals what's entered", () => {
    const c = newCharacter({ id: "v", name: "V", race: "race:human", class: "class:druid", abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
    c.classes = [{ class: "class:druid", level: 7, subclass: "subclass:circle-of-the-shepherd" }];
    expect(derive(c, reg).actions.find((x) => x.id === "spirit-totem-unicorn")?.heal?.text).toBe("7");
    const w = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 10, dex: 12, con: 14, int: 16, wis: 10, cha: 10 } }, reg);
    w.classes = [{ class: "class:wizard", level: 4, subclass: "subclass:school-of-necromancy" }];
    w.hp.current = 5;
    const l = new CharacterLog(w, reg, new HybridClock("t", () => (t += 1000)), "player");
    expect(derive(l.character, reg).actions.find((x) => x.id === "grim-harvest")?.healEntered).toMatch(/twice/);
    l.record("useAction", { action: "grim-harvest", rolled: 6 });
    expect(l.character.hp.current).toBe(11);
  });
});

describe("22w: healing that can go to someone else", () => {
  it("Hand of Healing, the Chalice and the Healer's stabilize ask on whom", () => {
    const c = newCharacter({ id: "m", name: "M", race: "race:human", class: "class:monk", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
    c.classes = [{ class: "class:monk", level: 6, subclass: "subclass:way-of-mercy" }];
    expect(derive(c, reg).actions.find((x) => x.id === "hand-of-healing")?.others).toBe(true);
    const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
    l.character.hp.current = 10;
    l.record("useAction", { action: "hand-of-healing", rolled: 7, onMe: false });
    expect(l.character.hp.current).toBe(10);
  });
});
