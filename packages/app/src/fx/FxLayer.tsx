import { useEffect, useRef, useState } from "react";
import type { Character } from "@dnd/schema";
import type { RollRecord } from "../rolls";
import { formFx, ongoingFx, opFx, rollFx, type FeatureLookup, type FxEvent, type SpellLookup } from "./triggers";
import { GenSpell } from "./GenSpell";
import type { GenLook } from "./generated";
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
  at: "tap" | "result" | "hp" | "conc" | "edge" | "center" | "sky" | "across" | "ground";
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
  /** Words shown and sent off (Sending). */
  words?: string[];
  /** A generated spell effect (fx/generated.ts): drawn by GenSpell. */
  gen?: GenLook;
  /** Shake the screen this long (7th-level spells and up; never under reduced motion). */
  shake?: number;
  /** A tap ends it early. */
  skippable?: boolean;
}

const SCHOOLS = ["evocation", "abjuration", "necromancy", "conjuration"];

/** Zone of Truth's words at this table (Giorgos's world), spoken by a celestial voice. */
export const TRUTH_LINES = [
  "Παροῦσα εἶναι ἡ Ἀλήθεια",
  "Συνδημιουργοί Της ἡ Ἐβέλ, ὁ Νάκαβαρ καὶ ὁ Σουλες",
  "Πεδία Της ἡ Πραγματικότητα, ἡ Ἀντικειμενικότητα, ἡ Ἀπολυτότητα καὶ ἡ Ἀναζήτηση",
  "Πεδία Μαγείας Της ἡ Γνώση, ἡ Εἰρήνη καὶ ἡ Τάξη",
  "Οὐδεὶς δὲν ψεύδεται",
];

/** The eladrin's seasons in this world, and their looks. */
const FEY_SEASONS: Record<string, string> = { Slumberfall: "autumn", Nocter: "winter", Titanspring: "spring", Heammer: "summer" };

export function specOf(e: FxEvent): FxSpec {
  switch (e.kind) {
    case "crit":
      return { at: "result", ms: 520, buzz: [35, 70, 35], look: "fx-crit", particles: 8 };
    case "fumble":
      return { at: "result", ms: 420, buzz: [40], look: "fx-fumble" };
    case "heal":
      return { at: "hp", ms: 700, look: "fx-heal", label: `+${e.amount} HP` };
    case "beacon-heal":
      return { at: e.other ? "center" : "hp", ms: 1300, buzz: [12, 40, 12], look: "fx-heal fx-beacon", label: `+${e.amount} HP · Beacon of Hope`, particles: 10 };
    case "temp":
      return { at: "hp", ms: 650, look: "fx-temp", label: `+${e.amount} temp` };
    case "defend":
      return { at: "hp", ms: 600, look: `fx-shield fx-${e.how}`, label: e.how === "prevented" ? "Blocked" : e.how === "absorbed" ? `Temp HP took ${e.amount}` : `${e.amount} less` };
    case "cast":
      return { at: "tap", ms: 700, look: `fx-cast${e.school && SCHOOLS.includes(e.school.toLowerCase()) ? ` fx-${e.school.toLowerCase()}` : ""}` };
    case "sneak":
      return { at: "result", ms: 450, look: "fx-sneak", label: "Sneak Attack" };
    case "floar":
      return { at: "edge", ms: e.zenith ? 2200 : 1600, buzz: e.zenith ? [30, 50, 30, 50, 90] : [25, 40, 60], look: `fx-floar${e.radiant ? " fx-floar-radiant" : ""}${e.zenith ? " fx-zenith" : ""}`, label: e.zenith ? "Floar · Zenith" : "Floar", skippable: true };
    case "theros": {
      const motif = { "Fair Weather": "sun", "Heammer Wisps": "wisps", "Thawing Cold": "thaw", "Radiant Passage": "passage" }[e.phenomenon] ?? "sun";
      return { at: "edge", ms: 2800, buzz: [20, 60, 20, 60, 40], look: `fx-theros fx-theros-${motif}`, label: `Theros: ${e.phenomenon}${e.days ? ` · ${e.days} day${e.days === 1 ? "" : "s"}` : ""}`, skippable: true };
    }
    // Zone of Truth: the table's words, spoken by a celestial voice, one line at a time.
    case "truth":
      return { at: "edge", ms: 1200 + TRUTH_LINES.length * 1700 + 2200, buzz: [10, 80, 10], look: "fx-truth", words: TRUTH_LINES, skippable: true };
    case "preserve-life":
      return { at: "edge", ms: 2800, buzz: [15, 30, 15, 30, 60], look: "fx-preserve", label: "Preserve Life", skippable: true };
    case "fey-step": {
      const season = e.season && FEY_SEASONS[e.season] ? e.season : undefined;
      return { at: "edge", ms: 1700, buzz: [20, 30, 40], look: `fx-fey${season ? ` fx-fey-${FEY_SEASONS[season]}` : ""}`, label: season ? `Fey Step · ${season}` : "Fey Step", skippable: true };
    }
    case "wrath":
      return { at: "edge", ms: 1400, buzz: [60, 40, 120], look: "fx-wrath", label: "Destructive Wrath · maximum", shake: 450 };
    case "concentration":
      return { at: "conc", ms: 600, look: e.kept ? "fx-conc-kept" : "fx-conc-lost", label: e.kept ? "Concentration held" : "Concentration lost" };
    case "death-save":
      return {
        at: "edge",
        ms: e.final ? 800 : 650,
        // A first or second success: a breath of pale light rising from below (the third keeps the old look).
        look: e.result === "success" && !e.final ? "fx-death-hope" : `fx-death fx-death-${e.result}${e.final ? " fx-death-final" : ""}`,
        label: e.final ? (e.result === "success" ? "Stable" : "Third failure") : e.result === "success" ? "Success" : "Failure",
      };
    case "inspiration":
      return { at: "tap", ms: 650, look: e.gained ? "fx-insp-gain" : "fx-insp-spend", ...(e.gained ? { particles: 5 } : {}) };
    // Sending: the words gather, drift up one after another and thin into a line of light that shoots away.
    case "sending":
      return { at: "center", ms: Math.min(3400, 1600 + e.words.length * 60), buzz: [15, 40, 15], look: "fx-sending", words: e.words };
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
    case "gen": {
      const g = e.g;
      return { at: g.at, ms: g.ms, look: `gs-${g.shape}`, buzz: g.buzz, gen: g, ...(g.shake ? { shake: g.shake } : {}), ...(g.skippable ? { skippable: true } : {}) };
    }
    case "spell": {
      const p = phaseLook(e.spell, e.phase, e.mode);
      // A phase with no look of its own plays nothing big: the generic circle for a cast, nothing otherwise.
      if (!p) return { at: "tap", ms: 700, look: "fx-cast" };
      return { at: p.at, ms: p.ms, look: `sfx ${p.look}`, ...(p.buzz ? { buzz: p.buzz } : {}), ...(p.particles ? { particles: p.particles } : {}) };
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
  /** Tapped away: fading out. */
  skip?: boolean;
}

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A short shake of what's on screen (the top strip, the page, the tabs and an open panel; never the
 * effects layer or anything fixed inside them). 7th-level spells and up; never under reduced motion.
 */
let shakeTimer: ReturnType<typeof setTimeout> | undefined;
function shakeScreen(ms: number, strong: boolean) {
  if (reducedMotion() || typeof document === "undefined") return;
  const html = document.documentElement;
  html.style.setProperty("--shake-ms", `${ms}ms`);
  html.classList.remove("fx-shake", "fx-shake-strong");
  // Restart the animation when a second one comes during the first.
  void html.offsetWidth;
  html.classList.add("fx-shake", ...(strong ? ["fx-shake-strong"] : []));
  if (shakeTimer) clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => html.classList.remove("fx-shake", "fx-shake-strong"), ms + 30);
}
function stopShake() {
  if (shakeTimer) clearTimeout(shakeTimer);
  document.documentElement.classList.remove("fx-shake", "fx-shake-strong");
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
  // Up from the bottom: at least a third of the screen to grow in, even when you tapped near the bottom.
  if (at === "ground") return { x: Math.min(Math.max(tap.x, 90), window.innerWidth - 90), y: Math.min(tap.y, window.innerHeight * 0.6) };
  // From the top of the screen down to where you tapped (lightning, moonlight), or across at that height (wind).
  return tap;
}

/** Plays one effect (and its buzz) now. Exported so a confirmed result outside an operation (a concentration save that held) can use it. */
export function playFx(e: FxEvent) {
  window.dispatchEvent(new CustomEvent("dnd-fx", { detail: e }));
}

export function FxLayer({ school, spell, feature, character }: { school: (spell: string) => string | undefined; spell?: SpellLookup; feature?: FeatureLookup; character?: Character | undefined }) {
  const [shown, setShown] = useState<Shown[]>([]);
  const shownRef = useRef<Shown[]>([]);
  shownRef.current = shown;
  const tap = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
  const next = useRef(1);
  const schoolRef = useRef(school);
  schoolRef.current = school;
  const spellRef = useRef(spell);
  spellRef.current = spell;
  const lastFeature = useRef({ id: "", at: 0 });
  const featureRef = useRef(feature);
  featureRef.current = feature;
  const characterRef = useRef(character);
  characterRef.current = character;

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      tap.current = { x: e.clientX, y: e.clientY };
      // A tap ends a long effect early (a 9th-level spell): it fades out quickly. The tap still does what it was for.
      const gone = shownRef.current.filter((x) => x.spec.skippable && !x.skip).map((x) => x.id);
      if (!gone.length) return;
      stopShake();
      setShown((s) => s.map((x) => (gone.includes(x.id) ? { ...x, skip: true } : x)));
      setTimeout(() => setShown((t) => t.filter((x) => !gone.includes(x.id))), 220);
    };
    const play = (events: FxEvent[]) => {
      for (const ev of events) {
        // One use recorded as two operations (its action, then its resource) plays once.
        if (ev.kind === "gen" && ev.g.sig?.startsWith("cls-")) {
          const now = Date.now();
          if (lastFeature.current.id === ev.g.spell && now - lastFeature.current.at < 800) continue;
          lastFeature.current = { id: ev.g.spell, at: now };
        }
        const s0 = specOf(ev);
        // Reduced motion: a generated effect is a short, still fade (and no shake).
        const spec = s0.gen && reducedMotion() ? { ...s0, ms: Math.min(s0.ms, 900), gen: { ...s0.gen, ms: Math.min(s0.ms, 900), shake: 0 }, skippable: false, shake: 0 } : s0;
        const id = next.current++;
        const show = () => {
          const p = placeOf(spec.at, tap.current);
          setShown((s) => [...s.slice(-5), { id, spec, ...p }]);
          setTimeout(() => setShown((s) => s.filter((x) => x.id !== id)), spec.ms + 50);
        };
        // A roll's result appears on screen right after it's saved: wait a frame or two for it.
        if (spec.at === "result") setTimeout(show, 40);
        else show();
        // The shake comes with the spell's climax: after a cast's sigil, at once for an impact.
        if (spec.shake) setTimeout(() => shakeScreen(spec.shake!, (spec.gen?.level ?? 0) >= 9), spec.gen?.phase === "cast" ? Math.round(spec.ms * 0.35) : 0);
        if (spec.buzz && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(spec.buzz);
      }
    };
    const onOp = (e: Event) => {
      const { type, payload, before, after } = (e as CustomEvent<{ type: string; payload: unknown; before: Character; after: Character }>).detail;
      play(opFx(type, payload, before, after, (s) => schoolRef.current(s), spellRef.current ? (s) => spellRef.current?.(s) : undefined, featureRef.current ? (t, pl) => featureRef.current?.(t, pl) : undefined));
    };
    const onRoll = (e: Event) => play(rollFx((e as CustomEvent<RollRecord>).detail, characterRef.current, spellRef.current ? (s) => spellRef.current?.(s) : undefined));
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
      {shown.map(({ id, spec, x, y, skip }) =>
        spec.gen ? (
          <GenSpell key={id} g={spec.gen} x={x} y={y} {...(skip ? { skip } : {})} />
        ) : spec.at === "sky" ? (
          <div key={id} className={`fx fx-sky ${spec.look}`} style={{ left: x, height: y, ["--fx-ms" as string]: `${spec.ms}ms` }}>
            <span className="sfx-cloud" />
            <svg className="sfx-bolt-path" viewBox="0 0 40 100" preserveAspectRatio="none">
              <path pathLength={1} d="M22,0 L14,30 L24,34 L10,66 L20,70 L8,100" />
            </svg>
            <span className="sfx-column" />
            <span className="sfx-hail" />
            <span className="sfx-glyph" />
          </div>
        ) : spec.at === "ground" ? (
          <div key={id} className={`fx fx-ground ${spec.look}`} style={{ left: x, top: y, ["--fx-ms" as string]: `${spec.ms}ms` }}>
            {spec.look.includes("sfx-vines") && (
              <svg className="sfx-vines-svg" viewBox="0 0 100 200" preserveAspectRatio="none">
                <path className="v1" pathLength={1} vectorEffect="non-scaling-stroke" d="M50,200 C40,160 64,130 50,95 C38,66 62,40 54,16 C52,8 44,6 42,14" />
                <path className="v2" pathLength={1} vectorEffect="non-scaling-stroke" d="M20,200 C30,170 8,150 22,120 C32,98 14,82 24,66" />
                <path className="v3" pathLength={1} vectorEffect="non-scaling-stroke" d="M80,200 C70,172 92,150 78,122 C68,100 88,84 76,64" />
                <path className="v4" pathLength={1} vectorEffect="non-scaling-stroke" d="M36,200 C44,182 30,170 40,150" />
                <path className="v5" pathLength={1} vectorEffect="non-scaling-stroke" d="M66,200 C58,184 72,170 62,150" />
              </svg>
            )}
            {spec.look.includes("sfx-whip") && (
              <svg className="sfx-whip-svg" viewBox="0 0 100 200" preserveAspectRatio="none">
                <path pathLength={1} vectorEffect="non-scaling-stroke" d="M10,200 C20,150 90,150 70,100 C55,62 20,60 50,4" />
                <path className="thorns" pathLength={1} vectorEffect="non-scaling-stroke" d="M10,200 C20,150 90,150 70,100 C55,62 20,60 50,4" />
              </svg>
            )}
            {spec.look.includes("sfx-overgrowth") &&
              Array.from({ length: 12 }, (_, i) => <span key={`l${i}`} className="sfx-leaf" style={{ ["--a" as string]: `${-80 + i * 14.5}deg`, animationDelay: `${300 + (i % 4) * 70}ms` }} />)}
            {spec.look.includes("sfx-enrich") && (
              <>
                <span className="sfx-glow" />
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className="sfx-sprout" style={{ left: `${(i - 4) * 34}px`, animationDelay: `${(Math.abs(i - 4) * 110 + (i % 2) * 60)}ms` }} />
                ))}
              </>
            )}
            {spec.look.includes("sfx-thorn-wall") && (
              <svg className="sfx-thorn-wall-svg" viewBox="0 0 400 120" preserveAspectRatio="none">
                {["M0,120 C40,60 80,110 120,50 C160,0 200,90 240,40 C280,0 330,80 400,30", "M0,110 C50,40 90,90 140,60 C190,30 220,100 270,60 C320,20 360,90 400,60", "M0,120 C30,80 70,70 100,90 C150,120 180,40 230,70 C280,100 330,50 400,90"].map((d, i) => (
                  <g key={i} className={`b${i + 1}`}>
                    <path pathLength={1} vectorEffect="non-scaling-stroke" d={d} />
                    <path className="thorns" pathLength={1} vectorEffect="non-scaling-stroke" d={d} />
                  </g>
                ))}
              </svg>
            )}
            {spec.look.includes("sfx-spikes") && Array.from({ length: 11 }, (_, i) => <span key={i} className="sfx-spike" style={{ left: `${(i - 5) * 26}px`, animationDelay: `${Math.abs(i - 5) * 45}ms` }} />)}
            {spec.look.includes("sfx-grasp") && (
              <>
                <svg className="sfx-ground-cracks" viewBox="-60 -10 120 20">
                  <path d="M0,0 L-18,-3 L-34,2 L-56,-2 M0,0 L16,3 L30,-2 L56,2 M-18,-3 L-24,-9 M16,3 L22,9" />
                </svg>
                <svg className="sfx-hand-svg" viewBox="-40 -60 80 120">
                  <path className="open" d="M-22,60 L-22,4 L-30,-30 L-22,-32 L-14,-4 L-12,-48 L-4,-49 L-2,-6 L2,-52 L10,-51 L10,-6 L16,-44 L24,-42 L20,0 L30,-14 L36,-8 L22,24 L22,60 Z" />
                  <path className="fist" d="M-22,60 L-22,-2 C-22,-20 -10,-24 0,-24 C14,-24 24,-18 24,-4 L24,14 L22,60 Z M-20,-8 L22,-8 M-20,4 L22,4" />
                </svg>
              </>
            )}
            <span className="sfx-dust" />
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
            {spec.look.startsWith("fx-floar") && (
              <>
                {Array.from({ length: 11 }, (_, i) => (
                  <span key={`t${i}`} className="fx-floar-tongue" style={{ left: `${(i * 9.6) % 100}%`, ["--i" as string]: String(i), animationDelay: `${(i % 5) * 70}ms` }} />
                ))}
                {Array.from({ length: 16 }, (_, i) => (
                  <span key={`e${i}`} className="fx-floar-ember" style={{ left: `${(i * 37 + 11) % 100}%`, animationDelay: `${200 + (i % 8) * 90}ms` }} />
                ))}
                <span className="fx-floar-ring" />
                {spec.look.includes("fx-zenith") && (
                  <span className="fx-zenith-sun">
                    {Array.from({ length: 12 }, (_, i) => (
                      <span key={i} className="fx-zenith-ray" style={{ transform: `rotate(${i * 30}deg)` }} />
                    ))}
                  </span>
                )}
              </>
            )}
            {spec.look.startsWith("fx-theros") && (
              <>
                <span className="fx-theros-sky" />
                <span className="fx-theros-arc">
                  <span className="fx-theros-sun" />
                </span>
                <span className="fx-theros-land" />
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i} className="fx-theros-mote" style={{ left: `${(i * 29 + 7) % 100}%`, top: `${40 + ((i * 17) % 40)}%`, animationDelay: `${600 + (i % 6) * 140}ms` }} />
                ))}
              </>
            )}
            {spec.look === "fx-truth" && spec.words && (
              <>
                <span className="fx-truth-beam" />
                <span className="fx-truth-halo" />
                {Array.from({ length: 14 }, (_, i) => (
                  <span key={`m${i}`} className="fx-truth-mote" style={{ left: `${(i * 31 + 9) % 100}%`, animationDelay: `${(i % 7) * 260}ms` }} />
                ))}
                <span className="fx-truth-words" lang="grc">
                  {spec.words.map((w, i) => (
                    <span key={i} className={`fx-truth-line${i === spec.words!.length - 1 ? " last" : ""}`} style={{ animationDelay: `${1200 + i * 1700}ms` }}>
                      {w}
                    </span>
                  ))}
                </span>
              </>
            )}
            {spec.look === "fx-preserve" && (
              <>
                <span className="fx-preserve-pool" />
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={`s${i}`} className="fx-preserve-stream" style={{ left: `${6 + i * 10.8 + ((i * 13) % 5) - 2}%`, animationDelay: `${(i % 4) * 110}ms`, ["--w" as string]: `${14 + ((i * 7) % 4) * 9}px` }} />
                ))}
                {Array.from({ length: 18 }, (_, i) => (
                  <span key={`d${i}`} className="fx-preserve-drop" style={{ left: `${(i * 23 + 5) % 100}%`, animationDelay: `${300 + (i % 9) * 120}ms` }} />
                ))}
                <span className="fx-preserve-crest" />
              </>
            )}
            {spec.look.startsWith("fx-fey") && (
              <>
                <span className="fx-fey-ring a" />
                <span className="fx-fey-ring b" />
                {Array.from({ length: 16 }, (_, i) => (
                  <span key={i} className="fx-fey-bit" style={{ ["--a" as string]: `${i * 22.5}deg`, animationDelay: `${(i % 4) * 60}ms` }} />
                ))}
              </>
            )}
            {spec.look === "fx-wrath" && (
              <svg className="fx-wrath-bolts" viewBox="0 0 390 844" preserveAspectRatio="none">
                <path className="b1" pathLength={1} d="M200,0 L176,150 L214,170 L168,330 L206,346 L150,560" />
                <path className="b2" pathLength={1} d="M70,0 L92,110 L60,130 L96,260 L72,272 L104,420" />
                <path className="b3" pathLength={1} d="M330,0 L306,96 L338,112 L298,230 L322,240 L290,360" />
              </svg>
            )}
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
            {spec.look.includes("sfx-sg") && <GuardianRing side={sideOf(spec.look)} count={6} />}
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
            {spec.look.includes("sfx-shock") && (
              <svg className="sfx-arcs" viewBox="-50 -50 100 100">
                {[0, 72, 144, 216, 288].map((a, i) => (
                  <path key={a} className={`a${i % 2}`} d="M0,-8 L4,-18 L-3,-24 L3,-34 L-2,-44" transform={`rotate(${a + 15})`} />
                ))}
              </svg>
            )}
            {spec.look.includes("sfx-crush") && (
              <svg className="sfx-crush-svg" viewBox="-40 -40 80 80">
                <path d="M-20,30 L-20,-2 C-20,-18 -8,-22 0,-22 C12,-22 22,-16 22,-2 L22,12 L20,30 Z M-18,-6 L20,-6 M-18,6 L20,6" />
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
            {spec.words && (
              <>
                <span className="fx-send-words">
                  {spec.words.map((w, i) => (
                    <span key={i} style={{ ["--i" as string]: String(i), ["--n" as string]: String(spec.words!.length) }}>
                      {w}
                    </span>
                  ))}
                </span>
                <span className="fx-send-line" />
              </>
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

/**
 * A quiet loop at the screen's edges: a spell's while you concentrate on it
 * (Moonbeam's shimmer, Call Lightning's storm), or a transformation's while its
 * state is on (Necrotic Shroud, Form of Dread). Follows the engine's state only:
 * it appears with it, fades out when it ends, pauses while the app is in the
 * background, and stands still under reduced motion.
 */
const FORM_KEYS = Object.keys(FORM_FX);

/** Which of the three Spirit Guardians looks a class list asks for. */
const sideOf = (look: string): "good" | "neutral" | "evil" => (look.includes("sfx-sg-good") ? "good" : look.includes("sfx-sg-evil") ? "evil" : "neutral");

/**
 * One spectral guardian, drawn small: a winged sentinel with a halo (good), a hooded watcher with a pale
 * mask (neutral), or a tattered wraith with burning eyes (evil). Plain SVG shapes, no filters.
 */
function GuardianFigure({ side }: { side: "good" | "neutral" | "evil" }) {
  if (side === "good")
    return (
      <svg className="sg-svg" viewBox="-20 -24 40 44">
        <ellipse className="halo" cx="0" cy="-17" rx="6" ry="2" />
        <path className="wing" d="M-3,-6 C-12,-14 -19,-8 -18,2 C-14,-2 -9,-2 -4,2 Z" />
        <path className="wing" d="M3,-6 C12,-14 19,-8 18,2 C14,-2 9,-2 4,2 Z" />
        <path className="body" d="M0,-14 C4,-14 5,-9 5,-6 L7,16 L-7,16 L-5,-6 C-5,-9 -4,-14 0,-14 Z" />
      </svg>
    );
  if (side === "evil")
    return (
      <svg className="sg-svg" viewBox="-20 -24 40 44">
        <path className="body" d="M0,-18 C9,-18 11,-8 10,0 L12,8 L7,6 L8,16 L3,10 L0,18 L-3,10 L-8,16 L-7,6 L-12,8 L-10,0 C-11,-8 -9,-18 0,-18 Z" />
        <circle className="eye" cx="-3.5" cy="-8" r="1.6" />
        <circle className="eye" cx="3.5" cy="-8" r="1.6" />
      </svg>
    );
  return (
    <svg className="sg-svg" viewBox="-20 -24 40 44">
      <path className="body" d="M0,-18 C8,-18 10,-10 9,-4 L11,16 L-11,16 L-9,-4 C-10,-10 -8,-18 0,-18 Z" />
      <ellipse className="mask" cx="0" cy="-8" rx="4.5" ry="5.5" />
    </svg>
  );
}

/** Guardians in a ring: each on its own arm of the orbit, kept upright as the ring turns. */
function GuardianRing({ side, count }: { side: "good" | "neutral" | "evil"; count: number }) {
  return (
    <span className={`sg-ring sg-${side}`} style={{ ["--n" as string]: String(count) }}>
      <span className="sg-rotor">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="sg-arm" style={{ ["--a" as string]: `${(360 / count) * i}deg`, ["--i" as string]: String(i) }}>
            <span className="sg-fig">
              <span className="sg-glow" />
              <GuardianFigure side={side} />
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Spirit Guardians while you concentrate: the ring around your hit points (the status strip at the top
 * stays put, so it's measured when it changes size, not every frame). A step you record makes it drift.
 */
function GuardianOrbit({ look, ending, paused }: { look: string; ending: boolean; paused: boolean }) {
  const [at, setAt] = useState<{ x: number; y: number } | undefined>();
  const [drift, setDrift] = useState(false);
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(".vitals .hp");
      if (!el) return setAt(undefined);
      const r = el.getBoundingClientRect();
      setAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
    measure();
    const el = document.querySelector(".vitals .hp");
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(measure) : undefined;
    if (ro && el) ro.observe(el);
    window.addEventListener("resize", measure);
    // The strip can move when the page underneath scrolls on some phones: measure again, at most once a frame.
    let pending = 0;
    const onScroll = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        measure();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const onOp = (e: Event) => {
      const { type, payload } = (e as CustomEvent<{ type: string; payload: { kind?: string; amount?: number } }>).detail;
      if (type === "useEconomy" && payload?.kind === "move" && (payload.amount ?? 0) > 0) {
        setDrift(true);
        setTimeout(() => setDrift(false), 750);
      }
    };
    window.addEventListener("dnd-op", onOp);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("dnd-op", onOp);
      if (pending) cancelAnimationFrame(pending);
    };
  }, []);
  if (!at) return null;
  return (
    <div className={`sfx-ongoing ${look}${ending ? " ending" : ""}${paused ? " paused" : ""}${drift ? " drift" : ""}`} style={{ ["--x" as string]: `${at.x}px`, ["--y" as string]: `${at.y}px` }}>
      <GuardianRing side={sideOf(look)} count={5} />
    </div>
  );
}

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
  if (shown.look.includes("sfx-ongoing-sg")) return <GuardianOrbit look={shown.look} ending={shown.ending} paused={hidden} />;
  return (
    <div className={`sfx-ongoing ${shown.look}${shown.ending ? " ending" : ""}${hidden ? " paused" : ""}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ ["--i" as string]: String(i) }} />
      ))}
    </div>
  );
}
