import { describe, expect, it } from "vitest";
import { relicsOf, RELICS } from "../src/fx/relics.js";
import { opFx } from "../src/fx/triggers.js";
import { specOf } from "../src/fx/FxLayer.js";

const ch = (over: Record<string, unknown>) => ({ classes: [], choices: {}, race: "", effects: [], toggles: [], inventory: [], spells: [], summons: [], resourcesUsed: {}, hp: { current: 10, temp: 0 }, ...over }) as never;

describe("19l: homebrew items' emblems", () => {
  it("shown while attuned (or the tome's lore absorbed), glowing while their power is on", () => {
    const c = ch({
      inventory: [
        { id: "a", item: "item:tattoo-of-guardian-winds", quantity: 1, equipped: true, attuned: true },
        { id: "b", item: "item:tattoo-of-unlocking", quantity: 1, equipped: true, attuned: false },
        { id: "c", item: "item:pearl-of-regeneration", quantity: 1, equipped: true, attuned: true },
        { id: "d", item: "item:longsword", quantity: 1, equipped: true, attuned: false },
      ],
      toggles: ["guardian-winds"],
      effects: [{ id: "t", effect: "effect:tome-of-wound-forbidding" }],
    });
    const r = relicsOf(c);
    expect(r.map((x) => x.motif)).toEqual(["tome", "winds", "pearl"]);
    expect(r.find((x) => x.motif === "winds")!.active).toBe(true);
    expect(r.find((x) => x.motif === "pearl")!.active).toBe(false);
    expect(Object.keys(RELICS)).toHaveLength(13);
  });
  it("Tattoo of Last Hope: a phoenix when it saves you", () => {
    const before = ch({ resourcesUsed: {} });
    const after = ch({ resourcesUsed: { "tattoo-last-hope": 1 }, hp: { current: 4, temp: 0 } });
    const ev = opFx("damage", { amount: 40 }, before, after);
    expect(ev).toContainEqual({ kind: "last-hope", hp: 4 });
    expect(specOf({ kind: "last-hope", hp: 4 }).label).toBe("Tattoo of Last Hope · 4 HP");
  });
});
