import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "../src/index.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();

describe("8i: Bardic Inspiration can be put on you, with a warning", () => {
  it("the action gives the Bardic Inspiration effect and says the rules give it to someone else", () => {
    const c = newCharacter({ id: "b", name: "B", race: "race:human", class: "class:bard", abilities: { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 16 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 5 };
    const sheet = derive(c, reg);
    const bi = sheet.actions.find((a) => a.id === "bardic-inspiration")!;
    expect(bi.gives?.effect).toBe("other:bardic-inspiration");
    expect(bi.gives?.selfWarning).toMatch(/other than you/);
    expect(sheet.resources.find((r) => r.id === "bardic-inspiration")?.die).toBe("d8");
  });
});
