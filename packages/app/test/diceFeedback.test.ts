import { describe, expect, it, vi } from "vitest";
import { buzz, feedbackOn, setFeedback } from "../src/dice/feedback";

(globalThis as { window?: EventTarget }).window ??= new EventTarget();

describe("Dice sound and vibration: off until the player turns them on", () => {
  it("off by default; a buzz only when vibration is on and the phone can", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    expect(feedbackOn("sound")).toBe(false);
    expect(feedbackOn("vibrate")).toBe(false);
    buzz([20]);
    expect(vibrate).not.toHaveBeenCalled();
    setFeedback("vibrate", true);
    buzz([20]);
    expect(vibrate).toHaveBeenCalledWith([20]);
    buzz(undefined);
    expect(vibrate).toHaveBeenCalledTimes(1);
    setFeedback("vibrate", false);
    vi.unstubAllGlobals();
  });
});
