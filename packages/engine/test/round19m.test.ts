import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "../src/index.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();

describe("19m: Features and traits in sections", () => {
  it("each class (more levels first, its subclass's features marked), then race, background, feats", () => {
    const c = newCharacter({ id: "m", name: "M", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 12, con: 14, int: 12, wis: 10, cha: 10 } }, reg);
    c.classes = [
      { class: "class:wizard", level: 2 },
      { class: "class:fighter", level: 5, subclass: "subclass:battle-master" },
    ];
    const fs = derive(c, reg).features.filter((f) => !f.common);
    const g = (name: string) => fs.find((f) => f.name === name)?.group;
    expect(g("Second Wind")).toMatchObject({ key: "class:fighter", label: "Fighter 5", level: 1 });
    expect(g("Combat Superiority")).toMatchObject({ key: "class:fighter", subclass: "Battle Master", level: 3 });
    expect(g("Arcane Recovery")).toMatchObject({ key: "class:wizard", label: "Wizard 2" });
    expect(g("Second Wind")!.order).toBeLessThan(g("Arcane Recovery")!.order);
    expect(fs.every((f) => f.group)).toBe(true);
    expect(fs.find((f) => f.kind === "race")?.group).toMatchObject({ key: "race", label: "Race: Human" });
  });
});
