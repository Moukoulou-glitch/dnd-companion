import type { CSSProperties } from "react";
import type { GenLook, School } from "./generated";
import { SIG_HIT, Signature } from "./Signature";

/**
 * The drawing of a generated spell effect (fx/generated.ts). Plain HTML and SVG
 * pieces moved only with transform and opacity (no blur filters, no canvas),
 * sized by the tier, coloured by --c (the damage type's or school's colour) and
 * --c2 (the school's second colour). Decorative only: aria-hidden comes from the
 * layer, pointer-events are none, and the spell's name is written so colour is
 * never the only signal.
 */

/** Sigil size per tier, in px (tier 3 and 4 also cap at the screen's width in CSS). */
const SIGIL = [90, 140, 210, 340, 520];

export function GenSpell({ g, x, y, skip }: { g: GenLook; x: number; y: number; skip?: boolean }) {
  const cast = g.phase === "cast";
  const t = g.tier;
  const style = {
    ["--x" as string]: `${x}px`,
    ["--y" as string]: `${y}px`,
    ["--c" as string]: g.rgb,
    ["--c2" as string]: g.rgb2,
    ["--ms" as string]: `${g.ms}ms`,
    ["--fx-ms" as string]: `${g.ms}ms`,
    ["--sig" as string]: `${SIGIL[t]}px`,
  } as CSSProperties;
  const parts = g.particles;
  // A signature spell's own piece replaces the generic shape (on its cast, and on its damage when it has a look for that).
  const sig = g.sig && (cast || SIG_HIT.has(g.sig)) ? Signature({ g, x, y }) : undefined;
  return (
    <div className={`gs gs-t${t} gs-s-${g.shape} gs-${g.school} gs-${cast ? "cast" : "hit"}${g.up ? " gs-up" : ""}${skip ? " gs-skip" : ""}${g.sig ? ` gsig-${g.sig}` : ""}`} style={style}>
      {t <= 2 && <span className="gs-halo" />}
      {t >= 3 && <span className="gs-dim" />}
      {t >= 2 && <span className="gs-vig" />}
      {t >= 3 && <span className="gs-rays" />}
      {t >= 4 && cast && (
        <span className="gs-pillars">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="gs-pillar" style={{ ["--i" as string]: String(i) }} />
          ))}
        </span>
      )}
      {sig?.screen}
      <span className="gs-at">
        {cast && !g.noSigil && <Sigil school={g.school} rings={g.rings} tier={t} />}
        {sig ? sig.at : <ShapePiece g={g} />}
        {Array.from({ length: parts }, (_, i) => (
          <span
            key={i}
            className="gs-p"
            style={{ ["--a" as string]: `${(360 / parts) * i + (i % 3) * 7}deg`, ["--i" as string]: String(i % 5), ["--d" as string]: `${40 + t * 28 + (i % 4) * 9}px` }}
          />
        ))}
      </span>
      {t >= 3 && <span className="gs-flash" />}
      {g.label && (t >= 3 && cast ? <span className="gs-title">{g.label}</span> : <span className="gs-label">{g.label}</span>)}
    </div>
  );
}

/** The magic circle: rings drawn one after another (more with the tier and a higher slot), rune marks, the school's glyph inside. */
function Sigil({ school, rings, tier }: { school: School; rings: number; tier: number }) {
  const marks = 8 + tier * 4;
  return (
    <svg className="gs-sigil" viewBox="-100 -100 200 200">
      {Array.from({ length: rings }, (_, i) => {
        const r = 96 - i * (56 / Math.max(1, rings));
        return <circle key={i} className={`ring r${i % 2}`} r={r} pathLength={1} style={{ ["--i" as string]: String(i) }} />;
      })}
      <g className="marks">
        {Array.from({ length: marks }, (_, i) => (
          <path key={i} d={i % 2 ? "M0,-96 L0,-88" : "M0,-96 L3,-90 L0,-84 L-3,-90 Z"} transform={`rotate(${(360 / marks) * i})`} />
        ))}
      </g>
      <g className="glyph">
        <Glyph school={school} glow />
        <Glyph school={school} />
      </g>
    </svg>
  );
}

/** A small mark for each school, inside the sigil and, larger, as its motif. */
function Glyph({ school, glow }: { school: School; glow?: boolean }) {
  const cls = glow ? "glow" : undefined;
  switch (school) {
    case "abjuration":
      return <path className={cls} pathLength={1} d="M0,-34 L30,-17 L30,17 L0,34 L-30,17 L-30,-17 Z M0,-20 L16,-10 L16,8 C16,18 6,24 0,26 C-6,24 -16,18 -16,8 L-16,-10 Z" />;
    case "conjuration":
      return <path className={cls} pathLength={1} d="M0,-34 L29,17 L-29,17 Z M0,34 L-29,-17 L29,-17 Z M10,0 A10,10 0 1 1 -10,0 A10,10 0 1 1 10,0" />;
    case "divination":
      return <path className={cls} pathLength={1} d="M-34,0 C-18,-22 18,-22 34,0 C18,22 -18,22 -34,0 Z M10,0 A10,10 0 1 1 -10,0 A10,10 0 1 1 10,0" />;
    case "enchantment":
      return <path className={cls} pathLength={1} d="M0,0 C4,-2 6,4 2,6 C-6,9 -10,1 -7,-6 C-3,-14 11,-14 14,-3 C18,11 3,21 -10,17 C-24,11 -25,-10 -13,-21 C0,-31 21,-27 28,-10" />;
    case "evocation":
      return <path className={cls} pathLength={1} d="M0,-36 L7,-7 L36,0 L7,7 L0,36 L-7,7 L-36,0 L-7,-7 Z M-22,-22 L-5,-5 M22,-22 L5,-5 M22,22 L5,5 M-22,22 L-5,5" />;
    case "illusion":
      return <path className={cls} pathLength={1} d="M-8,-30 A30,30 0 1 0 -8,30 A22,22 0 1 1 -8,-30 Z M8,-30 A30,30 0 1 1 8,30 A22,22 0 1 0 8,-30 Z" />;
    case "necromancy":
      return <path className={cls} pathLength={1} d="M0,-30 C17,-30 24,-18 24,-5 C24,6 18,10 15,14 L15,24 L-15,24 L-15,14 C-18,10 -24,6 -24,-5 C-24,-18 -17,-30 0,-30 Z M-12,-6 L-4,-6 L-4,2 L-12,2 Z M4,-6 L12,-6 L12,2 L4,2 Z M-7,24 L-7,16 M0,24 L0,16 M7,24 L7,16" />;
    case "transmutation":
      return <path className={cls} pathLength={1} d="M0,-34 L30,17 L-30,17 Z M-20,-20 L20,-20 L20,20 L-20,20 Z M14,0 A14,14 0 1 1 -14,0 A14,14 0 1 1 14,0" />;
    default:
      return <path className={cls} pathLength={1} d="M0,-34 L20,28 L-32,-11 L32,-11 L-20,28 Z" />;
  }
}

/** The spell's shape: its area (cone, line, sphere, cube, cylinder), a wall, a touch, a ray, an aura, healing, or the school's motif. */
function ShapePiece({ g }: { g: GenLook }) {
  switch (g.shape) {
    case "sphere":
      return (
        <>
          <span className="gs-core" />
          {Array.from({ length: Math.min(4, 1 + g.tier) }, (_, i) => (
            <span key={i} className="gs-wave" style={{ ["--i" as string]: String(i) }} />
          ))}
        </>
      );
    case "cube":
      return (
        <>
          <span className="gs-core" />
          <span className="gs-box" />
          <span className="gs-box b2" />
        </>
      );
    case "cone":
      return <span className="gs-cone" />;
    case "line":
      return <span className="gs-line" />;
    case "cylinder":
      return (
        <>
          <span className="gs-col" />
          <span className="gs-wave" style={{ ["--i" as string]: "0" }} />
        </>
      );
    case "wall":
      return (
        <span className="gs-wall">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} style={{ ["--i" as string]: String(i) }} />
          ))}
        </span>
      );
    case "touch":
      return (
        <>
          <span className="gs-core" />
          <span className="gs-wave" style={{ ["--i" as string]: "0" }} />
        </>
      );
    case "ray":
      return g.phase === "cast" ? <span className="gs-ray" /> : <span className="gs-core" />;
    case "aura":
      return (
        <>
          <span className="gs-aura" />
          <span className="gs-aura a2" />
        </>
      );
    case "heal":
      return (
        <>
          <span className="gs-core" />
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="gs-mote" style={{ ["--i" as string]: String(i) }} />
          ))}
        </>
      );
    default:
      return g.phase === "cast" ? (
        <svg className="gs-motif" viewBox="-50 -50 100 100">
          <Glyph school={g.school} glow />
          <Glyph school={g.school} />
        </svg>
      ) : (
        <span className="gs-core" />
      );
  }
}
