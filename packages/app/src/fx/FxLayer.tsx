import { useEffect, useRef, useState } from "react";
import type { Character } from "@dnd/schema";
import type { RollRecord } from "../rolls";
import { formFx, ongoingFx, opFx, rollFx, type FxEvent } from "./triggers";
import { phaseLook } from "./spells";
import { DAMAGE_FX, FORM_FX } from "./looks";

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
  at: "tap" | "result" | "hp" | "conc" | "edge" | "center" | "sky" | "across";
  /** How long it stays on screen, in ms (the CSS animations match). */
  ms: number;
  /** navigator.vibrate pattern, when the phone has it. */
  buzz?: number[];
  /** CSS class with the look (fx-crit, fx-heal...). */
  look: string;
  label?: string;
  /** Pieces flying outward (crit sparks, inspiration motes). */
  particles?: number;
  /** A damage type's colour and piece (fx/looks.ts). */
  dmg?: { rgb: string; shape: string };
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
    case "unarmed":
      // Placed where the Hit / Critical damage / Miss button was pressed, next to the roll.
      return e.result === "miss"
        ? { at: "tap", ms: 260, look: "fx-unarmed fx-unarmed-miss" }
        : e.result === "crit"
          ? { at: "tap", ms: 450, buzz: [30, 40, 30], look: "fx-unarmed fx-unarmed-crit", particles: 8 }
          : { at: "tap", ms: 380, buzz: [20], look: "fx-unarmed fx-unarmed-hit", particles: 5 };
    case "flurry":
      return { at: "tap", ms: 600, look: "fx-flurry" };
    case "mercy":
      return e.hand === "healing" ? { at: "tap", ms: 700, look: "fx-mercy-heal", particles: 8 } : { at: "tap", ms: 550, look: "fx-mercy-harm" };
    case "reckless":
      // The rage colours, small: a streak when it's taken, an impact only on a hit. Never Rage's whole veins.
      return e.hit ? { at: "tap", ms: 380, look: "fx-reckless-hit" } : { at: "result", ms: 350, look: "fx-reckless" };
    case "damage-type": {
      const d = DAMAGE_FX[e.type]!;
      return { at: "result", ms: 520, look: `fx-dmg fx-dmg-${d.shape}`, label: d.label, dmg: { rgb: d.rgb, shape: d.shape }, ...(d.buzz ? { buzz: d.buzz } : {}), ...(PARTICLES[d.shape] ? { particles: PARTICLES[d.shape] } : {}) };
    }
    case "hurt": {
      const d = DAMAGE_FX[e.type]!;
      return { at: "hp", ms: 560, look: `fx-dmg fx-hurt fx-dmg-${d.shape}`, label: `−${e.amount} ${d.label.toLowerCase()}`, dmg: { rgb: d.rgb, shape: d.shape }, ...(PARTICLES[d.shape] ? { particles: PARTICLES[d.shape] } : {}) };
    }
    case "charmed":
      return { at: "edge", ms: 900, look: "fx-charmed", label: "Charmed" };
    case "form": {
      const f = FORM_FX[e.form]!;
      return { at: "edge", ms: f.ms, look: f.start, label: f.label, ...(f.buzz ? { buzz: f.buzz } : {}) };
    }
    case "spell": {
      const p = phaseLook(e.spell, e.phase, e.mode);
      // A phase with no look of its own plays nothing big: the generic circle for a cast, nothing otherwise.
      if (!p) return { at: "tap", ms: 700, look: "fx-cast" };
      return { at: p.at, ms: p.ms, look: `sfx ${p.look}`, ...(p.buzz ? { buzz: p.buzz } : {}) };
    }
  }
}

/** Damage pieces that use flying dots (embers rising, frost shards, acid drops...). */
const PARTICLES: Record<string, number> = { embers: 7, frost: 6, drip: 5, cloud: 4, wisps: 6, impact: 5 };

/** The drawn piece for a damage type, in its colour. */
function DamagePiece({ shape }: { shape: string }) {
  switch (shape) {
    case "bolt":
      return (
        <svg className="fx-dmg-svg" viewBox="-50 -50 100 100">
          <path pathLength={1} d="M6,-46 L-8,-10 L6,-6 L-10,46" />
        </svg>
      );
    case "rays":
      return (
        <svg className="fx-dmg-svg" viewBox="-50 -50 100 100">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <path key={a} pathLength={1} d="M0,-14 L0,-46" transform={`rotate(${a})`} />
          ))}
        </svg>
      );
    case "cut":
      return (
        <svg className="fx-dmg-svg" viewBox="-50 -50 100 100">
          <path pathLength={1} d="M-40,34 Q0,4 42,-38" />
        </svg>
      );
    case "stab":
      return (
        <svg className="fx-dmg-svg" viewBox="-50 -50 100 100">
          <path pathLength={1} d="M-44,0 L30,0" />
          <path pathLength={1} d="M22,-7 L32,0 L22,7" />
        </svg>
      );
    case "waves":
    case "shock":
      return (
        <svg className="fx-dmg-svg" viewBox="-50 -50 100 100">
          <circle r="16" />
          <circle r="28" />
          <circle r="40" />
        </svg>
      );
    default:
      return null;
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
  // From the top of the screen down to where you tapped (lightning, moonlight), or across at that height (wind).
  return tap;
}

/** Plays one effect (and its buzz) now. Exported so a confirmed result outside an operation (a concentration save that held) can use it. */
export function playFx(e: FxEvent) {
  window.dispatchEvent(new CustomEvent("dnd-fx", { detail: e }));
}

export function FxLayer({ school, character }: { school: (spell: string) => string | undefined; character?: Character | undefined }) {
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
      <Ongoing look={ongoingFx(character)?.look} />
      {FORM_KEYS.map((f) => (
        <Ongoing key={f} look={formFx(character).find((x) => x.form === f)?.look} />
      ))}
      {shown.map(({ id, spec, x, y }) =>
        spec.at === "sky" ? (
          <div key={id} className={`fx fx-sky ${spec.look}`} style={{ left: x, height: y, ["--fx-ms" as string]: `${spec.ms}ms` }}>
            <span className="sfx-cloud" />
            <svg className="sfx-bolt-path" viewBox="0 0 40 100" preserveAspectRatio="none">
              <path pathLength={1} d="M22,0 L14,30 L24,34 L10,66 L20,70 L8,100" />
            </svg>
            <span className="sfx-column" />
            <span className="sfx-hail" />
            <span className="sfx-glyph" />
          </div>
        ) : spec.at === "across" ? (
          <div key={id} className={`fx fx-across ${spec.look}`} style={{ top: y, ["--fx-ms" as string]: `${spec.ms}ms` }}>
            {spec.look.includes("sfx-water") ? (
              <svg className="sfx-water-svg" viewBox="0 0 200 60" preserveAspectRatio="none">
                <path className="w1" d="M0,34 Q25,22 50,34 T100,34 T150,34 T200,34 L200,60 L0,60 Z" />
                <path className="w2" d="M0,40 Q25,30 50,40 T100,40 T150,40 T200,40 L200,60 L0,60 Z" />
                <path className="w3" d="M0,40 Q25,30 50,40 T100,40 T150,40 T200,40 L200,60 L0,60 Z" />
              </svg>
            ) : (
              Array.from({ length: 7 }, (_, i) => <span key={i} className="sfx-streak" style={{ top: `${10 + i * 13}%`, animationDelay: `${(i % 3) * 60}ms` }} />)
            )}
          </div>
        ) : spec.at === "edge" ? (
          <div key={id} className={`fx ${spec.look}`} style={{ animationDuration: `${spec.ms}ms`, ["--fx-ms" as string]: `${spec.ms}ms` }}>
            {spec.look.includes("fx-form-shroud") && (
              <svg className="fx-wings" viewBox="0 0 390 844" preserveAspectRatio="none">
                <path pathLength={1} d="M0,300 C60,250 90,300 120,360 C80,350 60,380 40,430 C30,400 10,400 0,420" />
                <path pathLength={1} d="M0,330 C40,330 70,360 80,410" />
                <path pathLength={1} d="M390,300 C330,250 300,300 270,360 C310,350 330,380 350,430 C360,400 380,400 390,420" />
                <path pathLength={1} d="M390,330 C350,330 320,360 310,410" />
              </svg>
            )}
            {spec.look.includes("fx-form-dread") && Array.from({ length: 8 }, (_, i) => <span key={i} className="fx-tatter" style={{ ["--i" as string]: String(i) }} />)}
            {spec.look === "fx-charmed" && (
              <svg className="fx-charm-swirl" viewBox="-50 -50 100 100">
                <path pathLength={1} d="M0,0 C6,-2 8,6 2,9 C-8,13 -14,2 -10,-8 C-4,-20 16,-20 20,-4 C26,16 4,30 -14,24 C-34,16 -36,-14 -18,-30 C0,-44 30,-38 40,-14" />
              </svg>
            )}
            {spec.look.includes("sfx-weather") &&
              Array.from({ length: 14 }, (_, i) => <span key={i} className="sfx-fleck" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 90}ms` }} />)}
            {spec.label && <span className="fx-label fx-label-mid">{spec.label}</span>}
          </div>
        ) : (
          <div key={id} className={`fx fx-at ${spec.look}`} style={{ left: x, top: y, ["--fx-ms" as string]: `${spec.ms}ms`, ...(spec.dmg ? { ["--fx-c" as string]: spec.dmg.rgb } : {}) }}>
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
            {spec.look.startsWith("fx-unarmed") && (
              <svg className="fx-speed" viewBox="-60 -60 120 120">
                {spec.look.includes("miss")
                  ? <path pathLength={1} d="M-50,18 Q0,-10 50,-22" />
                  : [0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} pathLength={1} d="M0,-56 L0,-22" transform={`rotate(${a + 22})`} />)}
              </svg>
            )}
            {spec.look === "fx-flurry" && [0, 1, 2].map((i) => <span key={i} className="fx-after" style={{ ["--i" as string]: String(i) }} />)}
            {spec.look === "fx-mercy-harm" && (
              <svg className="fx-hand" viewBox="-50 -50 100 100">
                <path d="M-14,30 L-14,-4 L-20,-24 M-14,-4 L-6,-30 M-6,-4 L2,-32 M2,-4 L10,-28 M10,-2 L22,-14 M-14,30 L14,30 L22,-14" />
              </svg>
            )}
            {(spec.look === "fx-reckless" || spec.look === "fx-reckless-hit") && (
              <svg className="fx-streak" viewBox="-60 -30 120 60">
                <path pathLength={1} d="M-56,14 L50,-10" />
                <path pathLength={1} d="M-50,24 L56,0" />
              </svg>
            )}
            {spec.look.includes("sfx-charm") && (
              <svg className="sfx-whirl sfx-charm-spiral" viewBox="-50 -50 100 100">
                <path pathLength={1} d="M0,0 C6,-2 8,6 2,9 C-8,13 -14,2 -10,-8 C-4,-20 16,-20 20,-4 C26,16 4,30 -14,24 C-34,16 -36,-14 -18,-30 C0,-44 30,-38 40,-14" />
              </svg>
            )}
            {spec.look.includes("sfx-water-whirl") && (
              <svg className="sfx-whirl" viewBox="-50 -50 100 100">
                <path pathLength={1} d="M0,0 C6,-2 8,6 2,9 C-8,13 -14,2 -10,-8 C-4,-20 16,-20 20,-4 C26,16 4,30 -14,24 C-34,16 -36,-14 -18,-30 C0,-44 30,-38 40,-14" />
              </svg>
            )}
            {spec.dmg && <DamagePiece shape={spec.dmg.shape} />}
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

/**
 * A quiet loop at the screen's edges: a spell's while you concentrate on it
 * (Moonbeam's shimmer, Call Lightning's storm), or a transformation's while its
 * state is on (Necrotic Shroud, Form of Dread). Follows the engine's state only:
 * it appears with it, fades out when it ends, pauses while the app is in the
 * background, and stands still under reduced motion.
 */
const FORM_KEYS = Object.keys(FORM_FX);

function Ongoing({ look }: { look: string | undefined }) {
  const [shown, setShown] = useState<{ look: string; ending: boolean } | undefined>(look ? { look, ending: false } : undefined);
  const [hidden, setHidden] = useState(typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    const v = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, []);
  useEffect(() => {
    if (look) return setShown({ look, ending: false });
    setShown((s) => (s ? { ...s, ending: true } : s));
    const t = setTimeout(() => setShown(undefined), 450);
    return () => clearTimeout(t);
  }, [look]);
  if (!shown) return null;
  return (
    <div className={`sfx-ongoing ${shown.look}${shown.ending ? " ending" : ""}${hidden ? " paused" : ""}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ ["--i" as string]: String(i) }} />
      ))}
    </div>
  );
}
