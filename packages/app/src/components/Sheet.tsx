import { useEffect, useRef, type ReactNode } from "react";
import { useDrag } from "./Swipe";
import { signed, signedDice, type Breakdown, type RollBreakdown } from "@dnd/engine";

/** A bottom sheet over the current screen. Closes on the scrim, Escape, or `onClose`. */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pull the handle down to close.
  const drag = useDrag("y", (dy) => dy > 90 && onClose());
  const pull = Math.max(0, drag.offset);

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        style={pull ? { transform: `translateY(${pull}px)`, transition: "none" } : undefined}
      >
        <div className="grab-zone" {...drag.handlers} aria-hidden="true">
          <div className="grabber" />
        </div>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** Every line that makes up a number, with dice, advantage and suggestions shown separately. */
export function BreakdownLines({ b, totalLabel = "Total" }: { b: Breakdown | RollBreakdown; totalLabel?: string }) {
  const roll = "dice" in b ? b : undefined;
  return (
    <>
      <ul className="lines">
        {b.parts.map((p, i) => (
          <li key={i}>
            <span>{p.label}</span>
            <b>{signed(p.value)}</b>
          </li>
        ))}
        {roll?.dice.map((d, i) => (
          <li key={`d${i}`}>
            <span>
              {d.label}
              {d.damageType ? ` (${d.damageType})` : ""}
            </span>
            <b>{signedDice(d.dice)}</b>
          </li>
        ))}
        <li className="total">
          <span>{totalLabel}</span>
          <span>
            {signed(b.total)}
            {roll?.dice.map((d) => ` ${signedDice(d.dice)}`).join("")}
          </span>
        </li>
      </ul>
      {roll && (roll.advantage.length > 0 || roll.disadvantage.length > 0) && (
        <>
          <p className="sub-head">Advantage and disadvantage</p>
          <ul className="lines">
            {roll.advantage.map((a) => (
              <li key={`a${a}`}>
                <span>{a}</span>
                <span className="tag adv">advantage</span>
              </li>
            ))}
            {roll.disadvantage.map((a) => (
              <li key={`z${a}`}>
                <span>{a}</span>
                <span className="tag">disadvantage</span>
              </li>
            ))}
          </ul>
          {roll.advantage.length > 0 && roll.disadvantage.length > 0 && (
            <p className="note">Advantage and disadvantage cancel out: roll one d20.</p>
          )}
        </>
      )}
      {roll && roll.suggestions.length > 0 && (
        <>
          <p className="sub-head">Can apply, your call</p>
          <ul className="lines">
            {roll.suggestions.map((s, i) => (
              <li key={`s${i}`}>
                <span>
                  {s.label}
                  {s.reason && <span className="why">{s.reason}</span>}
                </span>
                <b>{s.effect}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
