import { describe, expect, it } from "vitest";
import { CommitGuard, DOUBLE_TAP_MS } from "../src/commitGuard.js";

describe("A fast second tap is recorded once", () => {
  it("the same spending change within the window is ignored; anything else goes through", () => {
    const g = new CommitGuard();
    const pay = { action: "hound-of-ill-omen" };
    expect(g.allow("useAction", pay, 1000)).toBe(true);
    expect(g.allow("useAction", { ...pay }, 1000 + DOUBLE_TAP_MS - 1)).toBe(false);
    // A moment later it's a new use (and it only warns when there's nothing left).
    expect(g.allow("useAction", pay, 1000 + DOUBLE_TAP_MS * 2)).toBe(true);
    // Different details, or a change that spends nothing, always go through.
    expect(g.allow("useAction", { action: "umbral-form" }, 1000 + DOUBLE_TAP_MS * 2 + 1)).toBe(true);
    expect(g.allow("setName", { name: "x" }, 1)).toBe(true);
    expect(g.allow("setName", { name: "x" }, 2)).toBe(true);
    // After an undo, the same tap counts again.
    expect(g.allow("damage", { amount: 5 }, 10)).toBe(true);
    g.reset();
    expect(g.allow("damage", { amount: 5 }, 11)).toBe(true);
  });
});
