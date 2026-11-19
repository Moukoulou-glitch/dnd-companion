import { describe, expect, it } from "vitest";
import { knotPath, tokenLook } from "../src/components/Tokens";
import { FEAT_LOOKS } from "../src/fx/featureLooks";

describe("Play's trackers: knots for spell slots, tokens for features", () => {
  it("a knot for every slot level, each its own thread", () => {
    const paths = Array.from({ length: 9 }, (_, i) => knotPath(i + 1));
    expect(new Set(paths).size).toBe(9);
    for (const p of paths) expect(p).toMatch(/^M[\d. L]+Z$/);
  });
  it("a shared pool has its own sign; another feature's use takes its feature's look; anything else a rune of its own colour", () => {
    expect(tokenLook({ id: "channel-divinity", name: "Channel Divinity" }, []).glyph).toBe("sun");
    expect(tokenLook({ id: "ki", name: "Ki" }, []).glyph).toBe("fist");
    const id = Object.keys(FEAT_LOOKS)[0]!;
    expect(tokenLook({ id: "some-pool", name: "Some Pool" }, [{ id, cost: { resource: "some-pool", name: "Some Pool", amount: 1, remaining: 1 } }]).glyph).toBe(FEAT_LOOKS[id]!.glyph);
    const a = tokenLook({ id: "x", name: "Alpha" }, []);
    const b = tokenLook({ id: "y", name: "Omega" }, []);
    expect(a.glyph).toBe("rune");
    expect(a.c2).not.toBe(b.c2);
  });
});

describe("tokens made of what their feature comes from", () => {
  it("each class, race, feat and item has its own frame and material", async () => {
    const { FRAMES } = await import("../src/components/Tokens");
    const classes = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"].map((c) => `class:${c}`);
    for (const k of [...classes, "race", "feat", "item"]) expect(FRAMES[k], k).toBeDefined();
    expect(new Set(Object.values(FRAMES).map((f) => f.face)).size).toBe(Object.keys(FRAMES).length);
  });
  it("a resource knows where it comes from", async () => {
    const { derive, newCharacter } = await import("@dnd/engine");
    const { tableRegistry } = await import("../../engine/test/helpers.js");
    const reg = tableRegistry();
    const c = newCharacter({ id: "o", name: "O", race: "race:firbolg", class: "class:cleric", abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 12 } }, reg);
    c.classes = [{ class: "class:cleric", level: 2 }, { class: "class:fighter", level: 2 }];
    c.feats.push({ feat: "feat:lucky", from: "x" });
    const by = Object.fromEntries(derive(c, reg).resources.map((r) => [r.id, r.origin]));
    expect(by["channel-divinity"]).toBe("class:cleric");
    expect(by["action-surge"]).toBe("class:fighter");
    expect(by["hidden-step"]).toBe("race");
    expect(by["luck-points"]).toBe("feat");
  });
});
