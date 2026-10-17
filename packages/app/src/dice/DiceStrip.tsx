import { useEffect, useRef, useState } from "react";
import { DICE_EVENT, type DiceEvent } from "../diceBox";
import type { DiceMode } from "../dice3dSetting";

interface StripDie {
  sides: number;
  color?: string;
  label?: string;
  impact?: string;
  particles?: string;
  value?: number;
}

/** A natural 20 or a natural 1 on a d20: said in words, not by colour alone, and never called a rules success or failure. */
export function naturalOf(d: { sides: number; value?: number }): "nat20" | "nat1" | undefined {
  if (d.sides !== 20 || d.value === undefined) return undefined;
  return d.value === 20 ? "nat20" : d.value === 1 ? "nat1" : undefined;
}

/** The particles in the air for a throw: the first group's, when it has some (a mixed roll shows its main part's). */
export function airParticles(dice: { particles?: string }[]): string | undefined {
  return dice.find((d) => d.particles)?.particles;
}

/** At most this many pieces in the air at once, whatever the roll. */
export const MAX_PARTICLES = 12;

/**
 * While 3D dice roll: each die's value appears at the top as it settles,
 * grouped by what it's for (a damage type, a bonus), in its theme's colour,
 * so the numbers are readable whatever the dice are doing. As each one lands,
 * its chip plays its theme's impact; a natural 20 bursts into radiant flames
 * ("Natural 20" written on it), a natural 1 crumbles to ash ("Natural 1").
 * While the dice are in the air, a few of the main type's particles drift over
 * the screen (none in Reduced). A critical hit's damage says so.
 *
 * It's a reveal, not the result: the roll screen shows (and announces) the
 * result, so this is hidden from screen readers. It goes a moment after the
 * dice settle, or at once when the throw is skipped. It re-renders only when
 * a die settles; the motion is CSS (stopped while the page is hidden).
 */
export function DiceStrip() {
  const [dice, setDice] = useState<StripDie[] | null>(null);
  const [mode, setMode] = useState<DiceMode>("full");
  const [strong, setStrong] = useState(false);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<"nat20" | "nat1" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>();
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>();
  const pending = useRef<{ index: number; value: number }[]>([]);
  const frame = useRef(0);
  const flush = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    const landed = pending.current;
    pending.current = [];
    if (!landed.length) return;
    setDice((cur) => {
      if (!cur) return cur;
      const next = cur.slice();
      for (const l of landed) if (next[l.index]) next[l.index] = { ...next[l.index]!, value: l.value };
      return next;
    });
    // A natural 20 wins the flash over a natural 1 landing in the same frame.
    const nats = landed.map((l) => naturalOf({ sides: 20, value: l.value }) && dice20.current.has(l.index) ? naturalOf({ sides: 20, value: l.value }) : undefined);
    const nat = nats.includes("nat20") ? "nat20" : nats.includes("nat1") ? "nat1" : undefined;
    if (nat) {
      setFlash(nat);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), nat === "nat20" ? 1400 : 1100);
    }
  };
  /** Which dice of the current throw are d20s (for the natural 20 and 1 flash). */
  const dice20 = useRef(new Set<number>());
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<DiceEvent>).detail;
      if (d.type === "start") {
        if (timer.current) clearTimeout(timer.current);
        setDone(false);
        setMode(d.mode);
        setStrong(d.strong);
        setFlash(null);
        pending.current = [];
        dice20.current = new Set(d.dice.flatMap((x, i) => (x.sides === 20 ? [i] : [])));
        setDice(
          d.dice.map((x) => ({
            sides: x.sides,
            ...(x.look?.color ? { color: x.look.color } : {}),
            ...(x.look?.label ? { label: x.look.label } : {}),
            ...(x.look?.impact ? { impact: x.look.impact } : {}),
            ...(x.look?.particles ? { particles: x.look.particles } : {}),
          })),
        );
      } else if (d.type === "die") {
        // Dice landing together are shown together: one update per frame, however many land.
        pending.current.push(d);
        if (!frame.current) frame.current = requestAnimationFrame(flush);
      } else if (d.type === "end") {
        flush();
        setDone(true);
        timer.current = setTimeout(() => setDice(null), 2200);
      } else if (d.type === "skip") {
        pending.current = [];
        setDice(null);
        setFlash(null);
      }
    };
    window.addEventListener(DICE_EVENT, on);
    return () => {
      window.removeEventListener(DICE_EVENT, on);
      if (timer.current) clearTimeout(timer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    // flush reads only refs and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!dice?.length) return null;
  // Groups in order: a run of dice with the same label.
  const groups: { label?: string; dice: { d: StripDie; i: number }[] }[] = [];
  dice.forEach((d, i) => {
    const last = groups[groups.length - 1];
    if (last && last.label === d.label) last.dice.push({ d, i });
    else groups.push({ ...(d.label ? { label: d.label } : {}), dice: [{ d, i }] });
  });
  const air = !done && mode !== "reduced" ? airParticles(dice) : undefined;
  return (
    <>
      {air && (
        <div className={`dice-air air-${air} ${mode}`} aria-hidden="true">
          {Array.from({ length: mode === "fast" ? MAX_PARTICLES / 2 : MAX_PARTICLES }, (_, i) => (
            <span key={i} style={{ ["--i" as string]: String(i), ["--die" as string]: dice.find((d) => d.particles === air)?.color ?? "#fff" }} />
          ))}
        </div>
      )}
      {flash && <div className={`dice-flash ${flash} ${mode}`} aria-hidden="true" />}
      <div className={`dice-strip ${mode}${done ? " done" : ""}${dice.length > 12 ? " many" : ""}${strong ? " strong" : ""}`} aria-hidden="true">
        {strong && <span className="dice-strip-crit">Critical hit</span>}
        {groups.map((g, gi) => (
          <span key={gi} className="dice-strip-group">
            {g.label && <small>{g.label}</small>}
            {g.dice.map(({ d, i }) => {
              const nat = naturalOf(d);
              return (
                <b
                  key={i}
                  className={[d.value !== undefined ? "landed" : "", d.value !== undefined && d.impact ? `hit-${d.impact}` : "", nat ?? ""].filter(Boolean).join(" ")}
                  style={d.color ? { ["--die" as string]: d.color } : undefined}
                >
                  {d.value ?? `d${d.sides}`}
                  {nat && <em>{nat === "nat20" ? "Natural 20" : "Natural 1"}</em>}
                </b>
              );
            })}
          </span>
        ))}
      </div>
    </>
  );
}
