import { useEffect, useRef, useState } from "react";
import { DICE_EVENT, type DiceEvent } from "../diceBox";
import type { DiceMode } from "../dice3dSetting";

interface StripDie {
  sides: number;
  color?: string;
  label?: string;
  value?: number;
}

/**
 * While 3D dice roll: each die's value appears at the top as it settles,
 * grouped by what it's for (a damage type, a bonus), in its theme's colour,
 * so the numbers are readable whatever the dice are doing. It's a reveal, not
 * the result: the roll screen shows (and announces) the result, so this is
 * hidden from screen readers. It goes a moment after the dice settle, or at
 * once when the throw is skipped. Re-renders only when a die settles.
 */
export function DiceStrip() {
  const [dice, setDice] = useState<StripDie[] | null>(null);
  const [mode, setMode] = useState<DiceMode>("full");
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>();
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<DiceEvent>).detail;
      if (d.type === "start") {
        if (timer.current) clearTimeout(timer.current);
        setDone(false);
        setMode(d.mode);
        setDice(d.dice.map((x) => ({ sides: x.sides, ...(x.look?.color ? { color: x.look.color } : {}), ...(x.look?.label ? { label: x.look.label } : {}) })));
      } else if (d.type === "die") {
        setDice((cur) => (cur ? cur.map((x, i) => (i === d.index ? { ...x, value: d.value } : x)) : cur));
      } else if (d.type === "end") {
        setDone(true);
        timer.current = setTimeout(() => setDice(null), 1600);
      } else if (d.type === "skip") {
        setDice(null);
      }
    };
    window.addEventListener(DICE_EVENT, on);
    return () => {
      window.removeEventListener(DICE_EVENT, on);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  if (!dice?.length) return null;
  // Groups in order: a run of dice with the same label.
  const groups: { label?: string; dice: StripDie[] }[] = [];
  for (const d of dice) {
    const last = groups[groups.length - 1];
    if (last && last.label === d.label) last.dice.push(d);
    else groups.push({ ...(d.label ? { label: d.label } : {}), dice: [d] });
  }
  return (
    <div className={`dice-strip ${mode}${done ? " done" : ""}${dice.length > 12 ? " many" : ""}`} aria-hidden="true">
      {groups.map((g, gi) => (
        <span key={gi} className="dice-strip-group">
          {g.label && <small>{g.label}</small>}
          {g.dice.map((d, i) => (
            <b key={i} className={d.value !== undefined ? "landed" : ""} style={d.color ? { ["--die" as string]: d.color } : undefined}>
              {d.value ?? `d${d.sides}`}
            </b>
          ))}
        </span>
      ))}
    </div>
  );
}
