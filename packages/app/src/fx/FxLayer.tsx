import { useEffect, useRef, useState } from "react";
import type { Character } from "@dnd/schema";
import type { RollRecord } from "../rolls";
import { opFx, rollFx, type FxEvent } from "./triggers";

/**
 * The effects themselves: small, reusable CSS/SVG pieces drawn where they
 * belong (where you last tapped, the HP box, the screen's edge), each with
 * its colour, length and haptics. Decorative only: pointer-events none,
 * aria-hidden, a short label so colour isn't the only signal, and a static
 * fade under prefers-reduced-motion (in styles.css). Vibration is optional
 * and never repeats: one event, one pattern.
 */
export interface FxSpec {
  /** Where it's drawn. */
  at: "tap" | "result" | "hp" | "conc" | "edge" | "center";
  /** How long it stays on screen, in ms (the CSS animations match). */
  ms: number;
  /** navigator.vibrate pattern, when the phone has it. */
  buzz?: number[];
  /** CSS class with the look (fx-crit, fx-heal...). */
  look: string;
  label?: string;
  /** Pieces flying outward (crit sparks, inspiration motes). */
  particles?: number;
}

const SCHOOLS = ["evocation", "abjuration", "necromancy", "conjuration"];

export function specOf(e: FxEvent): FxSpec {
  switch (e.kind) {
    case "crit":
      return { at: "result", ms: 520, buzz: [35, 70, 35], look: "fx-crit", particles: 8 };
    case "fumble":
      return { at: "result", ms: 420, buzz: [40], look: "fx-fumble" };
    case "heal":
      return { at: "hp", ms: 700, look: "fx-heal", label: `+${e.amount} HP` };
    case "temp":
      return { at: "hp", ms: 650, look: "fx-temp", label: `+${e.amount} temp` };
    case "defend":
      return { at: "hp", ms: 600, look: `fx-shield fx-${e.how}`, label: e.how === "prevented" ? "Blocked" : e.how === "absorbed" ? `Temp HP took ${e.amount}` : `${e.amount} less` };
    case "cast":
      return { at: "tap", ms: 700, look: `fx-cast${e.school && SCHOOLS.includes(e.school.toLowerCase()) ? ` fx-${e.school.toLowerCase()}` : ""}` };
    case "sneak":
      return { at: "result", ms: 450, look: "fx-sneak", label: "Sneak Attack" };
    case "concentration":
      return { at: "conc", ms: 600, look: e.kept ? "fx-conc-kept" : "fx-conc-lost", label: e.kept ? "Concentration held" : "Concentration lost" };
    case "death-save":
      return {
        at: "edge",
        ms: e.final ? 800 : 650,
        look: `fx-death fx-death-${e.result}${e.final ? " fx-death-final" : ""}`,
        label: e.final ? (e.result === "success" ? "Stable" : "Third failure") : e.result === "success" ? "Success" : "Failure",
      };
    case "inspiration":
      return { at: "tap", ms: 650, look: e.gained ? "fx-insp-gain" : "fx-insp-spend", ...(e.gained ? { particles: 5 } : {}) };
    case "level-up":
      return { at: "center", ms: 1000, buzz: [30, 80, 30, 80, 60], look: "fx-level", label: `Level ${e.level}` };
  }
}

interface Shown {
  id: number;
  spec: FxSpec;
  x: number;
  y: number;
}

function placeOf(at: FxSpec["at"], tap: { x: number; y: number }): { x: number; y: number } {
  const center = (sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const mid = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  // The roll's total in the open roll (the result already says "Critical" or "Natural 1" in words).
  if (at === "result") return center(".sheet .result b") ?? tap;
  if (at === "hp") return center(".vitals .hp") ?? tap;
  if (at === "conc") return center(".chip.conc") ?? tap;
  if (at === "edge" || at === "center") return mid;
  return tap;
}

/** Plays one effect (and its buzz) now. Exported so a confirmed result outside an operation (a concentration save that held) can use it. */
export function playFx(e: FxEvent) {
  window.dispatchEvent(new CustomEvent("dnd-fx", { detail: e }));
}

export function FxLayer({ school }: { school: (spell: string) => string | undefined }) {
  const [shown, setShown] = useState<Shown[]>([]);
  const tap = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
  const next = useRef(1);
  const schoolRef = useRef(school);
  schoolRef.current = school;

  useEffect(() => {
    const onDown = (e: PointerEvent) => (tap.current = { x: e.clientX, y: e.clientY });
    const play = (events: FxEvent[]) => {
      for (const ev of events) {
        const spec = specOf(ev);
        const id = next.current++;
        const show = () => {
          const p = placeOf(spec.at, tap.current);
          setShown((s) => [...s.slice(-5), { id, spec, ...p }]);
          setTimeout(() => setShown((s) => s.filter((x) => x.id !== id)), spec.ms + 50);
        };
        // A roll's result appears on screen right after it's saved: wait a frame or two for it.
        if (spec.at === "result") setTimeout(show, 40);
        else show();
        if (spec.buzz && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(spec.buzz);
      }
    };
    const onOp = (e: Event) => {
      const { type, payload, before, after } = (e as CustomEvent<{ type: string; payload: unknown; before: Character; after: Character }>).detail;
      play(opFx(type, payload, before, after, (s) => schoolRef.current(s)));
    };
    const onRoll = (e: Event) => play(rollFx((e as CustomEvent<RollRecord>).detail));
    const onFx = (e: Event) => play([(e as CustomEvent<FxEvent>).detail]);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("dnd-op", onOp);
    window.addEventListener("dnd-roll", onRoll);
    window.addEventListener("dnd-fx", onFx);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("dnd-op", onOp);
      window.removeEventListener("dnd-roll", onRoll);
      window.removeEventListener("dnd-fx", onFx);
    };
  }, []);

  return (
    <div className="fx-layer" aria-hidden="true">
      {shown.map(({ id, spec, x, y }) =>
        spec.at === "edge" ? (
          <div key={id} className={`fx ${spec.look}`} style={{ animationDuration: `${spec.ms}ms` }}>
            {spec.label && <span className="fx-label fx-label-mid">{spec.label}</span>}
          </div>
        ) : (
          <div key={id} className={`fx fx-at ${spec.look}`} style={{ left: x, top: y, ["--fx-ms" as string]: `${spec.ms}ms` }}>
            <span className="fx-core" />
            <span className="fx-ring" />
            {spec.look.startsWith("fx-cast") && (
              <svg className="fx-circle" viewBox="-50 -50 100 100">
                <circle r="40" />
                <circle r="30" />
                {Array.from({ length: 8 }, (_, i) => (
                  <path key={i} d="M0,-40 L4,-34 L0,-28 L-4,-34 Z" transform={`rotate(${i * 45})`} />
                ))}
              </svg>
            )}
            {(spec.look === "fx-fumble" || spec.look === "fx-conc-lost") && (
              <svg className="fx-cracks" viewBox="-50 -50 100 100">
                <path d="M0,0 L14,-10 L22,-26 L34,-30" />
                <path d="M0,0 L-12,6 L-26,4 L-38,14" />
                <path d="M0,0 L4,16 L-2,30 L6,42" />
                <path d="M0,0 L-8,-14 L-20,-22" />
              </svg>
            )}
            {spec.look === "fx-sneak" && (
              <svg className="fx-slash" viewBox="-60 -60 120 120">
                <path className="ghost" pathLength={1} d="M-46,40 Q0,4 46,-44" />
                <path pathLength={1} d="M-40,46 Q4,8 50,-38" />
              </svg>
            )}
            {spec.look.startsWith("fx-insp") && (
              <svg className="fx-star" viewBox="-50 -50 100 100">
                <path d="M0,-22 L6,-7 L22,-7 L9,3 L14,19 L0,10 L-14,19 L-9,3 L-22,-7 L-6,-7 Z" />
              </svg>
            )}
            {Array.from({ length: spec.particles ?? 0 }, (_, i) => (
              <span key={i} className="fx-dot" style={{ ["--a" as string]: `${(360 / (spec.particles ?? 1)) * i + 20}deg`, ["--dx" as string]: `${(i - ((spec.particles ?? 1) - 1) / 2) * 9}px` }} />
            ))}
            {spec.label && <span className="fx-label">{spec.label}</span>}
          </div>
        ),
      )}
    </div>
  );
}
