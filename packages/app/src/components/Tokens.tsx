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

/**
 * What a token is made of, by where its feature comes from: a barbarian's claw-scored bone disc, a bard's plectrum,
 * a cleric's rayed amulet, a druid's leaf, a fighter's shield, a monk's prayer bead, a paladin's kite shield, a
 * ranger's arrowhead, a rogue's milled coin, a sorcerer's crystal, a warlock's eye-seal, a wizard's wax seal; a
 * river stone for a race, a laurel medal for a feat, a cut gem for an item.
 */
export const FRAMES: Record<
  string,
  {
    face: string;
    detail?: string;
    glyphBox?: [number, number, number];
    rim: string;
  }
> = {
  "class:barbarian": {
    face: "M50 5a45 45 0 1 0 0.1 0Z",
    detail: "M66 12l-12 22 M78 20l-14 22 M88 32l-14 20",
    glyphBox: [26, 30, 0.48],
    rim: "#d9cfb4",
  },
  "class:bard": {
    face: "M50 94C30 80 8 52 10 30C12 12 30 6 50 6S88 12 90 30C92 52 70 80 50 94Z",
    detail: "M28 18q22-10 44 0",
    glyphBox: [24, 20, 0.52],
    rim: "#e6c07a",
  },
  "class:cleric": {
    face: "M50 2l7 13 14-6 1 15 15 1-6 14 13 7-13 7 6 14-15 1-1 15-14-6-7 13-7-13-14 6-1-15-15-1 6-14L2 50l13-7-6-14 15-1 1-15 14 6Z",
    detail: "M50 20a30 30 0 1 0 0.1 0Z",
    glyphBox: [25, 25, 0.5],
    rim: "#f0c850",
  },
  "class:druid": {
    face: "M50 4C80 22 88 52 72 78C64 90 56 96 50 96C44 96 36 90 28 78C12 52 20 22 50 4Z",
    detail: "M50 12V92 M50 40l14-10 M50 56l-14-10 M50 70l14-10",
    glyphBox: [27, 26, 0.46],
    rim: "#6fae4a",
  },
  "class:fighter": {
    face: "M12 8H88V44C88 70 70 86 50 96C30 86 12 70 12 44Z",
    detail: "M12 26H88",
    glyphBox: [25, 30, 0.5],
    rim: "#b8c2cc",
  },
  "class:monk": {
    face: "M50 10a40 40 0 1 0 0.1 0Z",
    detail: "M50 0V10 M50 90V100 M42 96l8 4 8-4",
    glyphBox: [24, 24, 0.52],
    rim: "#a8784a",
  },
  "class:paladin": {
    face: "M50 2L90 20V48C90 72 72 88 50 98C28 88 10 72 10 48V20Z",
    detail: "M50 2V98 M10 40H90",
    glyphBox: [25, 24, 0.5],
    rim: "#f2e2a0",
  },
  "class:ranger": {
    face: "M50 2L86 56L64 50L66 96H34L36 50L14 56Z",
    detail: "M50 14V44",
    glyphBox: [28, 30, 0.44],
    rim: "#9a7a4a",
  },
  "class:rogue": {
    face: "M50 3l6 4 7-2 4 6 7 1 2 7 6 4-1 7 5 6-4 6 1 7-6 4-2 7-7 1-4 6-7-2-6 4-6-4-7 2-4-6-7-1-2-7-6-4 1-7-4-6 5-6-1-7 6-4 2-7 7-1 4-6 7 2Z",
    detail: "M50 16a34 34 0 1 0 0.1 0Z",
    glyphBox: [25, 25, 0.5],
    rim: "#d8b04a",
  },
  "class:sorcerer": {
    face: "M50 2L80 22L72 84L50 98L28 84L20 22Z",
    detail: "M50 2L50 98 M20 22L50 40L80 22",
    glyphBox: [26, 30, 0.48],
    rim: "#e8a8ff",
  },
  "class:warlock": {
    face: "M4 50C20 14 80 14 96 50C80 86 20 86 4 50Z",
    detail: "M50 4V16 M50 84V96 M10 22l8 8 M90 22l-8 8 M10 78l8-8 M90 78l-8-8",
    glyphBox: [26, 26, 0.48],
    rim: "#9a6ad8",
  },
  "class:wizard": {
    face: "M50 6c8 0 10 6 17 6s11 6 13 12 9 10 9 17-4 11-4 18-6 12-13 15-10 10-17 10-11-6-18-7-14-4-17-11-4-12-8-18 2-12 2-19 7-10 13-14 10-9 23-9Z",
    detail: "M50 18a32 32 0 1 0 0.1 0Z",
    glyphBox: [25, 25, 0.5],
    rim: "#c0392b",
  },
  race: {
    face: "M20 22C34 6 70 6 84 22C98 40 92 72 74 86C56 98 30 96 16 80C2 62 6 38 20 22Z",
    glyphBox: [24, 24, 0.52],
    rim: "#9aa39a",
  },
  feat: {
    face: "M50 8a42 42 0 1 0 0.1 0Z",
    detail: "M22 74C10 58 12 34 24 22 M78 74C90 58 88 34 76 22 M18 50l-8-4 M16 62l-8 0 M82 50l8-4 M84 62l8 0",
    glyphBox: [25, 24, 0.5],
    rim: "#e0c060",
  },
  item: {
    face: "M30 4H70L96 30V70L70 96H30L4 70V30Z",
    detail: "M30 4L50 22L70 4 M96 30L78 50L96 70 M70 96L50 78L30 96 M4 70L22 50L4 30",
    glyphBox: [27, 27, 0.46],
    rim: "#8fe3ff",
  },
};

export function ResourceToken({ look, spent, die, origin }: { look: TokenLook; spent: boolean; die?: string; origin?: string }) {
  const id = useId();
  const shape = die ? (DIE_SHAPES[/d\d+/.exec(die)?.[0] ?? ""] ?? DIE_SHAPES.d20!) : undefined;
  const frame = origin ? FRAMES[origin] : undefined;
  const [gx, gy, gs] = frame?.glyphBox ?? [22, 22, 0.56];
  return (
    <svg
      className="token"
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{
        ["--c1" as string]: `rgb(${look.c1})`,
        ["--c2" as string]: `rgb(${look.c2})`,
      }}
    >
      <defs>
        <radialGradient id={`${id}f`} cx="40%" cy="35%">
          <stop offset="0%" stopColor={`rgb(${look.c2})`} stopOpacity={1} />
          <stop offset="100%" stopColor={`rgb(${look.c2})`} stopOpacity={0.55} />
        </radialGradient>
      </defs>
      {shape ? (
        <path className="token-face" d={shape} fill={spent ? "none" : `url(#${id}f)`} style={{ stroke: spent || !frame ? undefined : frame.rim }} />
      ) : frame ? (
        <>
          <path className="token-face" d={frame.face} fill={spent ? "none" : `url(#${id}f)`} style={{ stroke: spent ? undefined : frame.rim }} />
          {frame.detail && <path className="token-rim" d={frame.detail} style={{ stroke: spent ? undefined : frame.rim }} />}
        </>
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
        <g transform={`translate(${gx} ${gy}) scale(${gs})`}>
          <path className="token-glyph" d={GLYPHS[look.glyph]} />
        </g>
      )}
    </svg>
  );
}
