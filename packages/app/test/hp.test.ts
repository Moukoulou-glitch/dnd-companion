import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hpBlinks, hpTier } from "../src/hp.js";

describe("HP frame colour", () => {
  it("follows the thresholds exactly at every boundary", () => {
    const at = (pct: number) => hpTier(pct, 100);
    expect([100, 80].map(at)).toEqual(["healthy", "healthy"]);
    expect([79, 50].map(at)).toEqual(["wounded", "wounded"]);
    expect([49, 25].map(at)).toEqual(["bloodied", "bloodied"]);
    expect([24, 11].map(at)).toEqual(["danger", "danger"]);
    expect([10, 1, 0].map(at)).toEqual(["critical", "critical", "critical"]);
    // Not rounded: just under a boundary stays below it.
    expect(hpTier(79.9, 100)).toBe("wounded");
    expect(hpTier(39, 49)).toBe("wounded"); // 79.6%
    expect(hpTier(4, 40)).toBe("critical"); // exactly 10%
    expect(hpTier(5, 45)).toBe("danger"); // 11.1%
  });

  it("is safe with odd data", () => {
    expect(hpTier(10, 0)).toBe("unknown");
    expect(hpTier(10, -5)).toBe("unknown");
    expect(hpTier(Number.NaN, 50)).toBe("unknown");
    expect(hpTier(60, 50)).toBe("healthy");
    expect(hpTier(-3, 50)).toBe("critical");
  });
});

describe("The existing low-HP blink is kept as it was", () => {
  it("blinks from 1 HP up to 10% of the maximum, not at 0 HP (death saves) and not in a form", () => {
    expect(hpBlinks(10, 100, false)).toBe(true);
    expect(hpBlinks(1, 100, false)).toBe(true);
    expect(hpBlinks(11, 100, false)).toBe(false);
    expect(hpBlinks(0, 100, false)).toBe(false);
    expect(hpBlinks(5, 100, true)).toBe(false);
    // Small maximums: 10% of 12 is 1.2, so only 1 HP blinks.
    expect(hpBlinks(1, 12, false)).toBe(true);
    expect(hpBlinks(2, 12, false)).toBe(false);
  });

  it("the blink rule is still in the stylesheet and no frame-colour rule touches animation", () => {
    const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
    expect(css).toMatch(/\.hp\.critical\s*\{\s*animation:\s*hp-critical 1\.1s ease-in-out infinite;/);
    expect(css).toMatch(/@keyframes hp-critical/);
    const tierRules = css.match(/\.hp(?:-frame)?\.tier-[a-z]+[^{]*\{[^}]*\}/g) ?? [];
    expect(tierRules.length).toBeGreaterThan(0);
    for (const r of tierRules) expect(r).not.toMatch(/animation|box-shadow|background/);
  });
});
