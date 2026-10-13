import { useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

/**
 * Long-press on the combat pills (Action, Bonus, Reaction) opens a menu; a
 * plain tap keeps doing what it did, at once. Chosen over double-tap so a tap
 * never has to wait to find out whether a second one is coming.
 *
 * - Hold for LONG_PRESS_MS without moving more than MOVE_TOLERANCE px: the menu
 *   opens once, and the click that ends the hold is swallowed (nothing is
 *   marked used).
 * - Android Chrome also fires `contextmenu` on a long press, and desktop
 *   browsers on a right-click: both open the same menu, never twice.
 * - Keyboard: the Context Menu key or Shift+F10 opens it; Enter/Space still tap.
 */
export const LONG_PRESS_MS = 500;
export const MOVE_TOLERANCE = 10;

export class PressTracker {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private start: { x: number; y: number } | undefined;
  /** The menu opened during this press: swallow the click that follows. */
  private fired = false;
  /** Opened at all during this press (stays set after the click is swallowed, until the next press). */
  private pressOpened = false;

  constructor(
    private readonly onLong: () => void,
    private readonly ms = LONG_PRESS_MS,
  ) {}

  down(x: number, y: number) {
    this.cancel();
    this.fired = false;
    this.pressOpened = false;
    this.start = { x, y };
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.open();
    }, this.ms);
  }

  /** A press that doesn't start the timer (a right-click): clears what the last press left. */
  newPress() {
    this.cancel();
    this.fired = false;
    this.pressOpened = false;
  }

  move(x: number, y: number) {
    if (this.start && Math.hypot(x - this.start.x, y - this.start.y) > MOVE_TOLERANCE) this.cancel();
  }

  /** Finger lifted, pointer left or cancelled: no long press (yet). */
  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.start = undefined;
  }

  /** Right-click, or the browser's own long-press menu: the same menu, only once per press. */
  contextMenu() {
    this.cancel();
    if (!this.pressOpened) this.open();
  }

  /** Keyboard (Context Menu key, Shift+F10). */
  key() {
    this.open();
    // A key doesn't produce a click to swallow, and the next key press may open it again.
    this.fired = false;
    this.pressOpened = false;
  }

  /** Called from onClick: true when this click ended a long press and must do nothing. */
  swallowClick(): boolean {
    if (!this.fired) return false;
    this.fired = false;
    return true;
  }

  private open() {
    this.fired = true;
    this.pressOpened = true;
    this.onLong();
  }
}

/** Props for a button: tap → onTap, long-press / right-click / Shift+F10 → onLong. */
export function useLongPress(onTap: () => void, onLong: () => void) {
  const long = useRef(onLong);
  const tap = useRef(onTap);
  long.current = onLong;
  tap.current = onTap;
  // After a hold opens the menu, the finger's lift still makes a click where it is: on a phone that
  // lands on the menu that just opened. Swallow that one click (up to 400 ms after the finger lifts).
  const t = useMemo(
    () =>
      new PressTracker(() => {
        swallowGhostClick();
        long.current();
      }),
    [],
  );
  useEffect(() => () => t.cancel(), [t]);
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return t.newPress();
      t.down(e.clientX, e.clientY);
    },
    onPointerMove: (e: PointerEvent) => t.move(e.clientX, e.clientY),
    onPointerUp: () => t.cancel(),
    onPointerLeave: () => t.cancel(),
    onPointerCancel: () => t.cancel(),
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      t.contextMenu();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        keyboardOpen = true;
        t.key();
        keyboardOpen = false;
      }
    },
    onClick: () => {
      if (t.swallowClick()) return;
      tap.current();
    },
  };
}

/** Set while the keyboard opens the menu: no finger, so no ghost click to swallow. */
let keyboardOpen = false;

function swallowGhostClick() {
  if (keyboardOpen || typeof document === "undefined") return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    done();
  };
  const lifted = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(done, 400);
  };
  const done = () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener("click", stop, true);
    document.removeEventListener("pointerup", lifted, true);
    document.removeEventListener("touchend", lifted, true);
  };
  document.addEventListener("click", stop, true);
  document.addEventListener("pointerup", lifted, true);
  document.addEventListener("touchend", lifted, true);
  // Whatever happens, never hold on to it for long.
  timer = setTimeout(done, 15000);
}
