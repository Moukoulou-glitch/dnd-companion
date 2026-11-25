import { afterEach, describe, expect, it, vi } from "vitest";
import { isAppleTouch, lightFx } from "../src/platform";

const nav = (userAgent: string, platform = "", maxTouchPoints = 0) => vi.stubGlobal("navigator", { userAgent, platform, maxTouchPoints });
const store = (v: string | null) => vi.stubGlobal("localStorage", { getItem: () => v, setItem: () => undefined });

describe("25b: lighter effects", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("iPhones and iPads (also an iPad asking for the desktop site) are Apple touch devices", () => {
    nav("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120");
    expect(isAppleTouch()).toBe(true);
    nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5);
    expect(isAppleTouch()).toBe(true);
    nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0);
    expect(isAppleTouch()).toBe(false);
    nav("Mozilla/5.0 (Linux; Android 14)", "Linux", 5);
    expect(isAppleTouch()).toBe(false);
  });
  it("on by default there, off elsewhere; the player's choice wins", () => {
    nav("Mozilla/5.0 (iPhone)");
    store(null);
    expect(lightFx()).toBe(true);
    store("0");
    expect(lightFx()).toBe(false);
    nav("Mozilla/5.0 (Linux; Android 14)");
    store(null);
    expect(lightFx()).toBe(false);
    store("1");
    expect(lightFx()).toBe(true);
  });
});
