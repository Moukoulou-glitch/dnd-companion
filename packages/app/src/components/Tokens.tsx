import { useId } from "react";
import type { ActionResult, ResourceResult } from "@dnd/engine";
import { CD_LOOKS, GLYPHS, type CdGlyph } from "../fx/divinity";
import { FEAT_LOOKS } from "../fx/featureLooks";

/**
 * The trackers on Play. A spell slot is a knot in the Weave (Ύφαντρο): to cast is to untie it. A slot of level N is
 * a knot of N loops; a spent one is the thread hanging loose. A feature's use is a token with its own sign and
 * colours, the same ones its animation plays in.
 */

/** A closed thread with `n` loops (an epitrochoid): one loop for a 1st-level slot, nine for a 9th. */
export function knotPath(n: number, size = 100): string {
  const a = n === 1 ? 1.05 : n === 2 ? 0.85 : 0.7;
  const pts: [number, number][] = [];
  const steps = 120 + n * 40;
  let max = 0;
  for (let i = 0; i <= steps; i++) {
    const t = (2 * Math.PI * i) / steps;
    // Rotated so the first loop hangs at the bottom, like a tied knot.
    const x = Math.cos(t) + a * Math.cos((n + 1) * t);
    const y = Math.sin(t) + a * Math.sin((n + 1) * t);
    const xr = y;
    const yr = -x;
    pts.push([xr, yr]);
    max = Math.max(max, Math.hypot(xr, yr));
  }
  const s = (size * 0.42) / max;
  const c = size / 2;
  return `M${pts.map(([x, y]) => `${(c + x * s).toFixed(1)} ${(c + y * s).toFixed(1)}`).join(" L")}Z`;
}

/** The loose thread of a spent slot: a wavy strand with a frayed end. */
const LOOSE = "M14 30 C26 18 34 44 48 32 S70 22 84 36 M84 36 l6 -4 M84 36 l7 2 M14 30 l-6 -3";

export function KnotToken({ level, spent, pact }: { level: number; spent: boolean; pact?: boolean }) {
  const id = useId();
  const n = Math.max(1, Math.min(9, level));
  const stroke = Math.max(2.4, 5.2 - n * 0.32);
  return (
    <svg className={`knot${pact ? " pact" : ""}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}g`}>
          <stop offset="0%" stopColor="var(--knot-glow)" stopOpacity={spent ? 0 : 0.55} />
          <stop offset="100%" stopColor="var(--knot-glow)" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={50} cy={50} r={48} fill={`url(#${id}g)`} />
      {spent ? (
        <path className="knot-loose" d={LOOSE} transform="translate(0 18)" strokeWidth={4} />
      ) : (
        <>
          <path className="knot-shadow" d={knotPath(n)} strokeWidth={stroke + 3} />
          <path className="knot-thread" d={knotPath(n)} strokeWidth={stroke} />
        </>
      )}
    </svg>
  );
}

export interface TokenLook {
  glyph: CdGlyph;
  /** "r, g, b": the sign's light, and the token's colour. */
  c1: string;
  c2: string;
}

/** Shared pools: their own sign, whichever feature spends them. */
const POOLS: [RegExp, TokenLook][] = [
  [/^channel-divinity/, { glyph: "sun", c1: "255, 244, 200", c2: "214, 160, 40" }],
  [/^ki$/, { glyph: "fist", c1: "255, 236, 210", c2: "214, 110, 40" }],
  [/^rage/, { glyph: "flame", c1: "255, 220, 200", c2: "200, 40, 40" }],
  [/^sorcery-points/, { glyph: "vortex", c1: "255, 220, 250", c2: "190, 60, 200" }],
  [/^superiority-dice/, { glyph: "sword", c1: "235, 240, 255", c2: "90, 110, 170" }],
  [/^bardic-inspiration/, { glyph: "star", c1: "255, 240, 255", c2: "160, 90, 220" }],
  [/psionic-energy/, { glyph: "eye", c1: "240, 225, 255", c2: "120, 80, 220" }],
  [/^wild-shape/, { glyph: "leaf", c1: "230, 255, 220", c2: "70, 150, 70" }],
  [/^lay-on-hands/, { glyph: "heart", c1: "255, 245, 225", c2: "220, 170, 60" }],
  [/^luck/, { glyph: "coin", c1: "255, 250, 220", c2: "200, 170, 40" }],
  [/breath/, { glyph: "flame", c1: "255, 230, 200", c2: "220, 90, 40" }],
  [/^rune-/, { glyph: "rune", c1: "220, 240, 255", c2: "70, 120, 190" }],
  // Features with an animation of their own (not a feature look): a sign to match it.
  [/^action-surge/, { glyph: "hourglass", c1: "255, 240, 220", c2: "200, 80, 40" }],
  [/^second-wind/, { glyph: "wind", c1: "235, 250, 255", c2: "60, 150, 170" }],
  [/^arcane-recovery/, { glyph: "book", c1: "225, 235, 255", c2: "80, 110, 210" }],
  [/^divine-sense/, { glyph: "eye", c1: "255, 248, 225", c2: "200, 160, 60" }],
  [/^divine-intervention/, { glyph: "sun", c1: "255, 250, 230", c2: "230, 180, 60" }],
  [/^steps-of-night/, { glyph: "moon", c1: "230, 225, 255", c2: "90, 70, 160" }],
  [/^twilight-sanctuary/, { glyph: "moon", c1: "255, 235, 220", c2: "150, 90, 170" }],
  [/^portent/, { glyph: "eye", c1: "240, 230, 255", c2: "110, 80, 200" }],
  [/^favored-by-the-gods/, { glyph: "laurel", c1: "255, 245, 215", c2: "200, 160, 50" }],
  [/^charm-of-sunlight/, { glyph: "sun", c1: "255, 245, 210", c2: "240, 170, 40" }],
  [/^giants-might/, { glyph: "fist", c1: "255, 235, 215", c2: "150, 90, 50" }],
  [/^indomitable/, { glyph: "shield", c1: "235, 240, 255", c2: "90, 110, 150" }],
  [/^tides-of-chaos/, { glyph: "vortex", c1: "240, 230, 255", c2: "150, 60, 200" }],
  [/^healing-hands/, { glyph: "heart", c1: "255, 250, 230", c2: "220, 190, 90" }],
  [/^relentless-endurance/, { glyph: "skull", c1: "250, 230, 220", c2: "150, 60, 50" }],
];

/** A token's look: a shared pool's sign, else the look of the feature that spends it, else a sign of its own. */
export function tokenLook(r: Pick<ResourceResult, "id" | "name">, actions: Pick<ActionResult, "id" | "cost">[]): TokenLook {
  const pool = POOLS.find(([re]) => re.test(r.id));
  if (pool) return pool[1];
  const by = actions.find((a) => a.id === r.id && (FEAT_LOOKS[a.id] || CD_LOOKS[a.id])) ?? actions.find((a) => a.cost?.resource === r.id && (FEAT_LOOKS[a.id] || CD_LOOKS[a.id]));
  const l = by ? (FEAT_LOOKS[by.id] ?? CD_LOOKS[by.id]) : undefined;
  if (l) return { glyph: l.glyph, c1: l.c1, c2: l.c2 };
  // Its own colour from its name, and a rune.
  let h = 0;
  for (const ch of r.name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const rgb = hsl(h, 0.45, 0.45);
  return { glyph: "rune", c1: "240, 240, 250", c2: rgb };
}

function hsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `${f(0)}, ${f(8)}, ${f(4)}`;
}

/** The die's own outline: a triangle for a d4, a square for a d6, a diamond for a d8, a kite for a d10, a pentagon for a d12, a hexagon for a d20. */
const DIE_SHAPES: Record<string, string> = {
  d4: "M50 6 L94 88 H6 Z",
  d6: "M12 12 H88 V88 H12 Z",
  d8: "M50 4 L94 50 L50 96 L6 50 Z",
  d10: "M50 4 L92 40 L50 96 L8 40 Z",
  d12: "M50 4 L95 37 L78 92 H22 L5 37 Z",
  d20: "M50 3 L91 26 V74 L50 97 L9 74 V26 Z",
  d100: "M50 4 L92 40 L50 96 L8 40 Z",
};

export function ResourceToken({ look, spent, die }: { look: TokenLook; spent: boolean; die?: string }) {
  const id = useId();
  const shape = die ? (DIE_SHAPES[/d\d+/.exec(die)?.[0] ?? ""] ?? DIE_SHAPES.d20!) : undefined;
  return (
    <svg className="token" viewBox="0 0 100 100" aria-hidden="true" style={{ ["--c1" as string]: `rgb(${look.c1})`, ["--c2" as string]: `rgb(${look.c2})` }}>
      <defs>
        <radialGradient id={`${id}f`} cx="40%" cy="35%">
          <stop offset="0%" stopColor={`rgb(${look.c2})`} stopOpacity={1} />
          <stop offset="100%" stopColor={`rgb(${look.c2})`} stopOpacity={0.55} />
        </radialGradient>
      </defs>
      {shape ? (
        <path className="token-face" d={shape} fill={spent ? "none" : `url(#${id}f)`} />
      ) : (
        <>
          <circle className="token-face" cx={50} cy={50} r={45} fill={spent ? "none" : `url(#${id}f)`} />
          {!spent && <circle className="token-rim" cx={50} cy={50} r={37} />}
        </>
      )}
      {die ? (
        <text className="token-die" x={50} y={die.length > 3 ? 60 : 62} textAnchor="middle">
          {die}
        </text>
      ) : (
        <g transform="translate(22 22) scale(0.56)">
          <path className="token-glyph" d={GLYPHS[look.glyph]} />
        </g>
      )}
    </svg>
  );
}
