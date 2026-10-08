import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** A die seen from above: the outline and the facet lines of each shape. */
const SHAPES: Record<number, { outline: string; facets: string[] }> = {
  // d6: a cube face.
  6: { outline: "M8 8 H52 V52 H8 Z", facets: [] },
  // d8: a triangle face inside its hexagon silhouette.
  8: { outline: "M30 4 L54 17 L54 43 L30 56 L6 43 L6 17 Z", facets: ["M30 4 L54 43 L6 43 Z"] },
  // d10: a kite, with the faces meeting at a low centre point.
  10: { outline: "M30 3 L55 25 L30 57 L5 25 Z", facets: ["M30 3 L18 32 L30 40 L42 32 Z", "M5 25 L18 32", "M55 25 L42 32", "M30 40 L30 57"] },
  // d12: a pentagon face inside its decagon silhouette.
  12: {
    outline: "M30 3 L46 8 L56 22 L56 38 L46 52 L30 57 L14 52 L4 38 L4 22 L14 8 Z",
    facets: ["M30 13 L45 24 L39 42 L21 42 L15 24 Z", "M30 3 L30 13", "M56 22 L45 24", "M46 52 L39 42", "M14 52 L21 42", "M4 22 L15 24"],
  },
  // d4 and d20, in case a table uses them.
  4: { outline: "M30 4 L56 52 L4 52 Z", facets: ["M30 4 L30 38 M4 52 L30 38 L56 52"] },
  20: { outline: "M30 3 L54 16 L54 44 L30 57 L6 44 L6 16 Z", facets: ["M30 14 L46 40 L14 40 Z"] },
};

export function DieShape({ sides, spent }: { sides: number; spent: boolean }) {
  const s = SHAPES[sides] ?? SHAPES[6]!;
  return (
    <svg viewBox="0 0 60 60" className="die-svg" aria-hidden="true" data-spent={spent}>
      <path d={s.outline} className="die-body" />
      {s.facets.map((d) => (
        <path key={d} d={d} className="die-facet" />
      ))}
      <text x="30" y={sides === 4 ? 46 : sides === 10 ? 31 : sides === 8 ? 38 : 35} className="die-num">
        {sides}
      </text>
    </svg>
  );
}

const SWIPE = 22;

/**
 * Hit Dice as dice: red while available, grey once spent. Swipe one down to
 * spend it; swipe a spent one up to get it back (the app asks first).
 * Keyboard: Enter or Arrow Down spends, Arrow Up gets one back.
 */
export function HitDiceRow({
  die,
  total,
  used,
  onSpend,
  onRestore,
  tone,
  what = "Hit Die",
  hintText = "Swipe a die down to spend it, or a grey one up to get it back.",
}: {
  die: string;
  total: number;
  used: number;
  onSpend: () => void;
  onRestore: () => void;
  /** Golden dice (Inspiration). */
  tone?: "gold";
  what?: string;
  hintText?: string;
}) {
  const sides = Number(die.replace(/^d/, "")) || 6;
  const start = useRef<{ y: number; i: number } | null>(null);
  const [drag, setDrag] = useState<{ i: number; dy: number } | null>(null);
  const [hint, setHint] = useState(false);

  const down = (i: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    start.current = { y: e.clientY, i };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!start.current) return;
    setDrag({ i: start.current.i, dy: Math.max(-26, Math.min(26, e.clientY - start.current.y)) });
  };
  const up = (spent: boolean) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s) return;
    const dy = e.clientY - s.y;
    if (dy > SWIPE && !spent) onSpend();
    else if (dy < -SWIPE && spent) onRestore();
    else if (Math.abs(dy) < 6) setHint(true);
  };

  return (
    <div className={`hit-dice-wrap${tone ? ` ${tone}` : ""}`}>
      <div className="hit-dice">
        {Array.from({ length: total }, (_, i) => {
          const spent = i >= total - used;
          const dy = drag?.i === i ? drag.dy : 0;
          return (
            <button
              key={i}
              className="hit-die"
              data-spent={spent}
              style={dy ? { transform: `translateY(${dy}px)` } : undefined}
              aria-label={spent ? `Spent ${what}. Swipe up to get it back` : `${what}. Swipe down to spend it`}
              onPointerDown={down(i)}
              onPointerMove={move}
              onPointerUp={up(spent)}
              onPointerCancel={() => {
                start.current = null;
                setDrag(null);
              }}
              onKeyDown={(e) => {
                if (!spent && (e.key === "ArrowDown" || e.key === "Enter")) {
                  e.preventDefault();
                  onSpend();
                } else if (spent && (e.key === "ArrowUp" || e.key === "Enter")) {
                  e.preventDefault();
                  onRestore();
                }
              }}
            >
              <DieShape sides={sides} spent={spent} />
            </button>
          );
        })}
      </div>
      {hint && <p className="die-hint">{hintText}</p>}
    </div>
  );
}
