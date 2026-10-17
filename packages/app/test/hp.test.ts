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
    // 8a: the blink is a glow layer whose opacity alone is animated (no repaint every frame).
    expect(css).toMatch(/\.hp\.critical::after\s*\{[^}]*animation:\s*hp-critical 1\.1s ease-in-out infinite;/);
    const keyframes = css.slice(css.indexOf("@keyframes hp-critical"), css.indexOf("}\n}", css.indexOf("@keyframes hp-critical")));
    expect(keyframes).toMatch(/opacity/);
    expect(keyframes).not.toMatch(/box-shadow|background/);
    // The frame rules (not the bar's fill, below) never touch the box's animation or background.
    const tierRules = (css.match(/\.hp(?:-frame)?\.tier-[a-z]+[^{]*\{[^}]*\}/g) ?? []).filter((r) => !/hp-bar|mini-bar/.test(r.split("{")[0]!));
    expect(tierRules.length).toBeGreaterThan(0);
    for (const r of tierRules) expect(r).not.toMatch(/animation|box-shadow|background/);
  });
});

describe("HP bar fill colour", () => {
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  it("the main bar and the small bars (companions, forms, summons) are filled in the tier's colour", () => {
    for (const tier of ["healthy", "wounded", "bloodied", "danger", "critical"]) {
      const rule = new RegExp(`\\.hp\\.tier-${tier} \\.hp-bar > span, \\.mini-bar > span\\.tier-${tier} \\{ background: var\\(--tier-${tier}\\); \\}`);
      expect(css).toMatch(rule);
    }
  });

  it("each tier colour is defined for dark and light themes", () => {
    for (const tier of ["healthy", "wounded", "bloodied", "danger", "critical"]) expect(css.match(new RegExp(`--tier-${tier}:`, "g"))?.length).toBeGreaterThanOrEqual(2);
  });

  it("the bar fill rules don't animate and don't touch the box (the blink stays its own rule)", () => {
    const fill = css.match(/[^}]*hp-bar > span[^{]*\{[^}]*\}/g) ?? [];
    for (const r of fill) expect(r).not.toMatch(/animation|box-shadow/);
  });
});
