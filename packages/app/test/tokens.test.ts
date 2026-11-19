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
