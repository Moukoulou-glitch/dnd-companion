import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS, PressTracker } from "../src/longPress.js";

describe("Long-press on the combat pills", () => {
  let opened = 0;
  let t: PressTracker;
  beforeEach(() => {
    vi.useFakeTimers();
    opened = 0;
    t = new PressTracker(() => opened++);
  });
  afterEach(() => vi.useRealTimers());

  it("a tap goes through at once and opens nothing", () => {
    t.down(10, 10);
    vi.advanceTimersByTime(120);
    t.cancel(); // finger up
    expect(t.swallowClick()).toBe(false); // the click does the usual thing
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(opened).toBe(0);
  });

  it("holding opens the menu once, and the click that ends the hold does nothing", () => {
    t.down(10, 10);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(opened).toBe(1);
    t.cancel();
    expect(t.swallowClick()).toBe(true);
    // The browser's own long-press menu event right after: not a second menu.
    t.contextMenu();
    expect(opened).toBe(1);
    // The next tap is an ordinary tap again.
    t.down(10, 10);
    t.cancel();
    expect(t.swallowClick()).toBe(false);
  });

  it("if the browser's click never comes after a hold, the next tap still works", () => {
    t.down(10, 10);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    t.cancel();
    t.down(10, 10);
    t.cancel();
    expect(t.swallowClick()).toBe(false);
    expect(opened).toBe(1);
  });

  it("moving the finger (a scroll) cancels it", () => {
    t.down(10, 10);
    t.move(10, 40);
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(opened).toBe(0);
  });

  it("right-click or the browser's long-press menu opens it once", () => {
    t.down(10, 10);
    vi.advanceTimersByTime(200);
    t.contextMenu();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(opened).toBe(1);
  });

  it("a right-click after an earlier hold still opens it", () => {
    t.down(10, 10);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    t.cancel();
    t.swallowClick();
    t.newPress(); // right button down
    t.contextMenu();
    expect(opened).toBe(2);
  });

  it("the keyboard opens it without swallowing the next Enter", () => {
    t.key();
    expect(opened).toBe(1);
    expect(t.swallowClick()).toBe(false);
  });
});
