import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "../src/index.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();

describe("every subclass builds at every level", () => {
  it("derives without errors", () => {
    const errors: string[] = [];
    for (const sc of reg.list("subclass")) {
      for (const level of [1, 3, 5, 6, 7, 10, 11, 14, 15, 17, 18, 20]) {
        try {
          const c = newCharacter({ id: "x", name: "X", race: "race:human", class: sc.class, abilities: { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 } }, reg);
          c.classes[0] = { ...c.classes[0]!, level, subclass: sc.id };
          derive(c, reg);
        } catch (e) {
          errors.push(`${sc.id} @${level}: ${(e as Error).message}`);
          break;
        }
      }
    }
    expect(errors).toEqual([]);
  });
});
