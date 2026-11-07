import { describe, expect, it } from "vitest";
import { strikeFx, opFx } from "../src/fx/triggers.js";
import { specOf } from "../src/fx/FxLayer.js";
import { myDieLook } from "../src/dice/mine.js";
import { SENTIENT_WEAPONS, sentientDiceKey } from "../src/fx/sentient.js";

describe("19k: sentient weapons", () => {
  it("each answers a hit, a critical hit and a miss in its own way", () => {
    for (const id of Object.keys(SENTIENT_WEAPONS)) {
      for (const o of ["hit", "crit", "miss"] as const) {
        const ev = strikeFx(id, o).find((e) => e.kind === "sentient")!;
        expect(ev).toEqual({ kind: "sentient", weapon: id, outcome: o });
        const spec = specOf(ev);
        expect(spec.look).toContain(`fx-sw-${SENTIENT_WEAPONS[id]!.motif}`);
        expect(spec.label).toBe(SENTIENT_WEAPONS[id]!.lines[o]);
      }
    }
    expect(strikeFx("item:longsword", "hit").some((e) => e.kind === "sentient")).toBe(false);
  });
  it("Blackrazor devouring a soul has its look", () => {
    const ch = { classes: [], choices: {}, race: "", effects: [], toggles: [], inventory: [], spells: [], summons: [] } as never;
    const ev = opFx("useAction", { action: "blackrazor-devour", amount: 40 }, ch, ch);
    expect(ev).toContainEqual({ kind: "sentient", weapon: "item:blackrazor", outcome: "devour" });
  });
  it("their own dice: the weapon's key wins over the damage type's look", () => {
    const look = myDieLook("slashing", "Blackrazor", [sentientDiceKey("item:blackrazor")]);
    expect(look.color).toBe(SENTIENT_WEAPONS["item:blackrazor"]!.dice.color);
    expect(myDieLook("slashing", "Longsword").color).not.toBe(SENTIENT_WEAPONS["item:blackrazor"]!.dice.color);
  });
});
