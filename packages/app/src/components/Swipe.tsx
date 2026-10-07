import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

/**
 * Tracks a one-finger drag along one axis. Returns the current offset and the
 * pointer handlers; `onRelease` gets the final offset.
 */
export function useDrag(axis: "x" | "y", onRelease: (offset: number) => void) {
  const start = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const pos = (e: PointerEvent) => (axis === "x" ? e.clientX : e.clientY);
  return {
    offset,
    dragging: start.current !== null,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        // Taps on buttons inside (the toast's Undo) stay ordinary taps.
        if ((e.target as HTMLElement).closest("button")) return;
        start.current = pos(e);
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (start.current !== null) setOffset(pos(e) - start.current);
      },
      onPointerUp: () => {
        if (start.current === null) return;
        const final = offset;
        start.current = null;
        setOffset(0);
        onRelease(final);
      },
      onPointerCancel: () => {
        start.current = null;
        setOffset(0);
      },
    },
  };
}

/**
 * "Swipe to …": drag the knob all the way across to confirm, so a stray tap
 * never ends a turn. Keyboard and screen readers get a plain button inside.
 */
export function SwipeButton({ label, onConfirm, tone = "primary" }: { label: string; onConfirm: () => void; tone?: "primary" | "plain" }) {
  const track = useRef<HTMLDivElement>(null);
  const knob = 56;
  const max = () => Math.max(1, (track.current?.clientWidth ?? 300) - knob - 8);
  const drag = useDrag("x", (dx) => {
    if (dx >= max() * 0.85) onConfirm();
  });
  const x = Math.min(Math.max(0, drag.offset), max());
  const style: CSSProperties = { transform: `translateX(${x}px)`, transition: drag.offset ? "none" : "transform 0.2s" };
  return (
    <div className={`swipe ${tone}`} ref={track}>
      <span className="swipe-label" style={{ opacity: 1 - x / max() }}>
        {label}
      </span>
      <div className="swipe-knob" style={style} {...drag.handlers} aria-hidden="true">
        »
      </div>
      <button className="visually-hidden" onClick={onConfirm}>
        {label}
      </button>
    </div>
  );
}

/** A toast you can flick away sideways or upward. */
export function SwipeAway({ onDismiss, className, children }: { onDismiss: () => void; className: string; children: ReactNode }) {
  const [gone, setGone] = useState(false);
  const drag = useDrag("x", (dx) => {
    if (Math.abs(dx) > 80) {
      setGone(true);
      onDismiss();
    }
  });
  if (gone) return null;
  return (
    <div className={className} role="status" style={{ translate: `${drag.offset}px 0`, opacity: 1 - Math.min(0.8, Math.abs(drag.offset) / 200) }} {...drag.handlers}>
      {children}
    </div>
  );
}
