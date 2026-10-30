import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * The heritage crest: from character level 10, a permanent emblem of the
 * character's race woven around the HP box and behind the name (raven wings
 * for a shadar-kai, horns for a tiefling, vines for a wood elf...), with a
 * small animation of its own. Part of it sits behind the box, part crosses
 * over its border, so it reads as one piece with it.
 */
export type Motif =
  | "wings"
  | "horns"
  | "vines"
  | "stars"
  | "web"
  | "runes"
  | "peaks"
  | "gears"
  | "crystals"
  | "laurel"
  | "flames"
  | "sun"
  | "waves"
  | "wind"
  | "shards"
  | "tusks"
  | "spikes"
  | "serpent"
  | "tail"
  | "clover"
  | "thorns"
  | "wisps"
  | "frost";

export interface CrestSpec {
  motif: Motif;
  /** Main colour, second colour, and the glow of its animation. */
  c1: string;
  c2: string;
  glow: string;
  /** A variant of the motif: wings "raven" | "angel" | "ash" | "bat" | "dragon" | "crow"; vines "blossom" | "autumn" | "leaf"... */
  variant?: string;
  /** What it is, for the label ("Raven wings"). */
  label: string;
}

export const CREST_LEVEL = 10;

const W = (motif: Motif, c1: string, c2: string, glow: string, label: string, variant?: string): CrestSpec => ({ motif, c1, c2, glow, label, ...(variant ? { variant } : {}) });

/** Each race (and subrace) the app knows, by id. */
export const RACE_CRESTS: Record<string, CrestSpec> = {
  "race:shadar-kai": W("wings", "#2a2140", "#46386e", "#a78bff", "Raven wings", "raven"),
  "race:kenku": W("wings", "#2c2a33", "#4a4754", "#d6d1e4", "Crow feathers", "crow"),
  "race:protector-aasimar": W("wings", "#f3ead2", "#d9b65a", "#fff3c4", "Wings of light", "angel"),
  "race:scourge-aasimar": W("flames", "#fff1c9", "#ffc94a", "#ffffff", "Radiant flames", "radiant"),
  "race:fallen-aasimar": W("wings", "#3a3234", "#62514f", "#ff7a4a", "Ashen wings", "ash"),
  "race:dhampir": W("wings", "#3a1a26", "#8a2a40", "#e0405a", "Bat wings", "bat"),
  "race:tiefling": W("horns", "#3a1c24", "#7a2f35", "#ff6a2a", "Infernal horns"),
  "race:hexblood": W("thorns", "#5a6a3a", "#8a5aa8", "#c8ff7a", "Crown of thorns"),
  "race:reborn": W("wisps", "#9fb3b8", "#d9e4e6", "#bff6ff", "Stitches and wisps"),
  "race:human": W("laurel", "#c9a646", "#7d6a2c", "#fff1b0", "Laurel"),
  "race:variant-human": W("laurel", "#c9a646", "#7d6a2c", "#fff1b0", "Laurel"),
  "race:half-elf": W("laurel", "#9fbf6a", "#c9a646", "#f4ffd0", "Laurel and leaf", "leaf"),
  "race:high-elf": W("stars", "#cfd8ff", "#7d8cd6", "#ffffff", "Moon and stars"),
  "race:wood-elf": W("vines", "#4f7d3a", "#2f5a2a", "#c8ff9a", "Vines", "leaf"),
  "race:sea-elf": W("waves", "#3fa7c9", "#1d5f80", "#c9f4ff", "Sea foam"),
  "race:drow": W("web", "#b9b2d6", "#6a4fa3", "#c58bff", "Spider silk"),
  "race:eladrin": W("stars", "#e6c9ff", "#8d6ad6", "#ffffff", "Feywild stars"),
  "race:hill-dwarf": W("runes", "#7a6650", "#4a3d30", "#ffb347", "Hearth runes"),
  "race:mountain-dwarf": W("runes", "#6f7883", "#3d444d", "#8fd3ff", "Mountain runes"),
  "race:duergar": W("runes", "#5c5862", "#34313a", "#c38bff", "Deep runes"),
  "race:goliath": W("peaks", "#7d8792", "#c9d4dc", "#ffffff", "Mountain peaks"),
  "race:rock-gnome": W("gears", "#b48a3c", "#7a5a24", "#ffd77a", "Brass gears"),
  "race:forest-gnome": W("vines", "#6a9a4a", "#3f6a33", "#e2ffb0", "Mossy sprigs", "leaf"),
  "race:deep-gnome": W("crystals", "#6d7fa8", "#3b4766", "#b6d2ff", "Deep crystals"),
  "race:lightfoot-halfling": W("clover", "#5e9a4a", "#3c6a30", "#e8ffb0", "Lucky clover"),
  "race:stout-halfling": W("clover", "#7a9a3a", "#4f6a24", "#fff0a0", "Lucky clover"),
  "race:dragonborn": W("wings", "#8a2a1e", "#d6a24a", "#ffb35a", "Dragon wings", "dragon"),
  "race:chromatic-dragonborn": W("wings", "#7a2a1e", "#c24a2a", "#ff8a5a", "Dragon wings", "dragon"),
  "race:metallic-dragonborn": W("wings", "#a07a2a", "#e0c062", "#fff1b0", "Dragon wings", "dragon"),
  "race:gem-dragonborn": W("wings", "#6a4fa3", "#b9a2ff", "#f0e4ff", "Dragon wings", "dragon"),
  "race:kobold": W("wings", "#8a4a24", "#c27a3a", "#ffb35a", "Little dragon wings", "dragon"),
  "race:half-orc": W("tusks", "#e8dcc0", "#8a2a24", "#ff5a3a", "Tusks and war paint"),
  "race:orc": W("tusks", "#e8dcc0", "#8a2a24", "#ff5a3a", "Tusks and war paint"),
  "race:bugbear": W("spikes", "#6a4a30", "#a07a50", "#ffcf8a", "Bristling fur", "fur"),
  "race:goblin": W("spikes", "#6a7a3a", "#a0a050", "#fff07a", "Scrap spikes"),
  "race:hobgoblin": W("spikes", "#6f6a66", "#a33a2a", "#ffb07a", "Iron spikes"),
  "race:lizardfolk": W("spikes", "#e6dcc4", "#4f6a3a", "#d7ffb0", "Teeth and reeds", "teeth"),
  "race:yuan-ti-pureblood": W("serpent", "#3f6a3a", "#c9b04a", "#d7ff7a", "Serpent"),
  "race:tabaxi": W("tail", "#b0803a", "#3a2a1a", "#ffd07a", "Cat's tail"),
  "race:firbolg": W("vines", "#5e8a5a", "#8a6a4a", "#d9ffd0", "Forest boughs", "leaf"),
  "race:triton": W("waves", "#2f8fb0", "#1a4f70", "#bff0ff", "Deep waves"),
  "race:air-genasi": W("wind", "#bfe3ff", "#7fb3d9", "#ffffff", "Winds"),
  "race:earth-genasi": W("shards", "#8a6f4f", "#5a4a36", "#ffd08a", "Floating stones"),
  "race:fire-genasi": W("flames", "#ff7a2a", "#ffb84a", "#fff0a0", "Flames"),
  "race:water-genasi": W("waves", "#3fa0d9", "#1d5f9a", "#d0f6ff", "Waves"),
};

/** Races from book files the app doesn't know by id: by a word in their name. */
const BY_NAME: [RegExp, string][] = [
  [/aarakocra|owlin|raven/i, "race:shadar-kai"],
  [/aasimar/i, "race:protector-aasimar"],
  [/tiefling|minotaur|satyr|centaur/i, "race:tiefling"],
  [/dwarf/i, "race:mountain-dwarf"],
  [/gnome|warforged|vedalken|autognome/i, "race:rock-gnome"],
  [/halfling|harengon/i, "race:lightfoot-halfling"],
  [/elf|changeling|kalashtar|githzerai|githyanki|fairy/i, "race:high-elf"],
  [/dragonborn|draconic|kobold/i, "race:dragonborn"],
  [/orc/i, "race:half-orc"],
  [/genasi/i, "race:fire-genasi"],
  [/tortle|locathah|triton|merfolk/i, "race:triton"],
  [/yuan-ti|naga|serpent/i, "race:yuan-ti-pureblood"],
  [/tabaxi|leonin|cat/i, "race:tabaxi"],
  [/firbolg|loxodon|grung|dryad/i, "race:firbolg"],
  [/goliath/i, "race:goliath"],
  [/goblin|bugbear/i, "race:goblin"],
];

/** A dragonborn's ancestry (its picked feature, "feature:ftd-gem-ancestry-amethyst"): the wings in its colour. */
const ANCESTRY: Record<string, [string, string, string]> = {
  black: ["#1f2a22", "#4a5a3a", "#b7ff5a"],
  blue: ["#1f3f8a", "#4a7ad6", "#bfe0ff"],
  green: ["#1f5a33", "#4a9a5a", "#c9ffb0"],
  red: ["#8a1f1f", "#d64a2a", "#ffb35a"],
  white: ["#c9d4dc", "#ffffff", "#e0f6ff"],
  brass: ["#9a7a3a", "#d9b65a", "#fff0b0"],
  bronze: ["#7a5230", "#b5803f", "#ffd59a"],
  copper: ["#8a4a2a", "#c97a4a", "#ffc49a"],
  gold: ["#b08a24", "#f0cf5a", "#fff6c0"],
  silver: ["#8f99a3", "#d9e1e8", "#ffffff"],
  amethyst: ["#5a3a8a", "#a27ae0", "#f0dcff"],
  crystal: ["#8fb3c9", "#e0f4ff", "#ffffff"],
  emerald: ["#1f6a4a", "#4ac98a", "#d0ffe8"],
  sapphire: ["#1f4a9a", "#5a8ae0", "#d0e4ff"],
  topaz: ["#b07a1f", "#f0b84a", "#fff0c0"],
};

/** The eladrin's seasons in this world. */
const SEASONS: Record<string, CrestSpec> = {
  Titanspring: W("vines", "#5e9a4a", "#f2a6c9", "#ffe6f2", "Titanspring blossoms", "blossom"),
  Heammer: W("sun", "#f0b83a", "#ff7a2a", "#fff3b0", "Heammer sun"),
  Slumberfall: W("vines", "#b5652a", "#e0a03a", "#ffd08a", "Slumberfall leaves", "autumn"),
  Nocter: W("frost", "#bfe6ff", "#7fb3e0", "#ffffff", "Nocter frost"),
};

/**
 * The crest for a character, from character level 10 (the table's heritage
 * level): its race's (or subrace's), coloured by a dragonborn's ancestry or
 * an eladrin's season. Undefined below level 10.
 */
type CrestChar = { race: string; classes: { level: number }[]; choices?: Record<string, Record<string, string[]>> };
export const characterLevel = (c: { classes: { level: number }[] }) => c.classes.reduce((t, x) => t + x.level, 0);

export function crestFor(c: CrestChar, raceName?: string): CrestSpec | undefined {
  return characterLevel(c) < CREST_LEVEL ? undefined : raceCrest(c, raceName);
}

/** How long a glimpse of the crest lasts, below level 10. */
export const GLIMPSE_MS = 1500;

/** Below level 10, the chance a natural 20 shows the crest for a moment: 5% per character level (45% at 9th). */
export const glimpseChance = (level: number) => (level >= CREST_LEVEL || level < 1 ? 0 : Math.min(1, 0.05 * level));

/** Whether this natural 20 shows the crest; `rand` is a number from 0 up to 1. */
export const rollsGlimpse = (level: number, rand: number) => rand < glimpseChance(level);

/** The race's crest whatever the level (a glimpse of it below 10th). */
export function raceCrest(c: CrestChar, raceName?: string): CrestSpec {
  const picks = c.choices?.[c.race] ?? {};
  if (c.race === "race:eladrin") {
    const season = picks.season?.[0];
    if (season && SEASONS[season]) return SEASONS[season];
  }
  let spec = RACE_CRESTS[c.race];
  if (!spec && raceName) {
    const hit = BY_NAME.find(([re]) => re.test(raceName));
    if (hit) spec = RACE_CRESTS[hit[1]];
  }
  spec ??= W("laurel", "#b9a46a", "#7d6a3c", "#fff1b0", "Filigree", "filigree");
  const anc = picks.ancestry?.[0]?.match(/ancestry-([a-z]+)$/)?.[1];
  if (spec.variant === "dragon" && anc && ANCESTRY[anc]) {
    const [c1, c2, glow] = ANCESTRY[anc];
    spec = { ...spec, c1, c2, glow, label: `${anc[0]!.toUpperCase()}${anc.slice(1)} dragon wings` };
  }
  return spec;
}

/* ── Drawing ────────────────────────────────────────────────── */

/** Room around the HP box: left, top (up behind the name), right, bottom. */
export const PAD = { l: 16, t: 60, r: 8, b: 6 };

interface Geo {
  /** The box's corner and size in the crest's own pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

type Pt = [number, number];
const rad = (deg: number) => (deg * Math.PI) / 180;
const at = (p: Pt, deg: number, len: number): Pt => [p[0] + Math.cos(rad(deg)) * len, p[1] + Math.sin(rad(deg)) * len];
const f = (n: number) => Math.round(n * 10) / 10;
const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;

/** A leaf or feather: from `p`, `len` long at `deg`, `wide` across. */
function blade(p: Pt, deg: number, len: number, wide: number, tipBend = 0): string {
  const tip = at(p, deg + tipBend, len);
  const mid = at(p, deg, len * 0.45);
  const a = at(mid, deg - 90, wide / 2);
  const b = at(mid, deg + 90, wide / 2);
  return `M${pt(p)} Q${pt(a)} ${pt(tip)} Q${pt(b)} ${pt(p)} Z`;
}

/** A feather: narrow at its quill, broad along its vane, a rounded tip. */
function feather(p: Pt, deg: number, len: number, wide: number, bend = 0): string {
  const along = (t: number, side: number, w: number) => at(at(p, deg + bend * t, len * t), deg + bend * t + side * 90, w);
  const tip = at(p, deg + bend, len);
  // The vane is narrower on the leading side, and the tip comes to a soft point.
  return `M${pt(along(0, -1, wide * 0.1))} Q${pt(along(0.35, -1, wide * 0.36))} ${pt(along(0.7, -1, wide * 0.3))} Q${pt(along(0.92, -1, wide * 0.2))} ${pt(tip)} Q${pt(along(0.9, 1, wide * 0.42))} ${pt(along(0.6, 1, wide * 0.55))} Q${pt(along(0.25, 1, wide * 0.5))} ${pt(along(0, 1, wide * 0.1))} Z`;
}

/** Spins round a point of the crest (its own pixels). */
const origin = (p: Pt): CSSProperties => ({ transformOrigin: `${f(p[0])}px ${f(p[1])}px`, transformBox: "view-box" });
const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

/** One side, then the same mirrored across the box's middle. */
function both(g: Geo, side: (flip: boolean) => ReactNode): ReactNode {
  const cx = g.x + g.w / 2;
  return (
    <>
      <g>{side(false)}</g>
      <g transform={`translate(${f(cx * 2)} 0) scale(-1 1)`}>{side(true)}</g>
    </>
  );
}

function gear(cx: number, cy: number, r: number, teeth: number): string {
  const d: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 1.22;
    d.push(`${i ? "L" : "M"}${f(cx + Math.cos(a0) * rr)} ${f(cy + Math.sin(a0) * rr)} L${f(cx + Math.cos(a1) * rr)} ${f(cy + Math.sin(a1) * rr)}`);
  }
  return `${d.join(" ")} Z M${f(cx + r * 0.42)} ${f(cy)} A${f(r * 0.42)} ${f(r * 0.42)} 0 1 0 ${f(cx - r * 0.42)} ${f(cy)} A${f(r * 0.42)} ${f(r * 0.42)} 0 1 0 ${f(cx + r * 0.42)} ${f(cy)} Z`;
}

const star4 = (c: Pt, r: number) =>
  `M${pt([c[0], c[1] - r])} Q${pt([c[0] + r * 0.18, c[1] - r * 0.18])} ${pt([c[0] + r, c[1]])} Q${pt([c[0] + r * 0.18, c[1] + r * 0.18])} ${pt([c[0], c[1] + r])} Q${pt([c[0] - r * 0.18, c[1] + r * 0.18])} ${pt([c[0] - r, c[1]])} Q${pt([c[0] - r * 0.18, c[1] - r * 0.18])} ${pt([c[0], c[1] - r])} Z`;

/** What goes behind the box (and the name) and what crosses over its border. */
export function drawCrest(spec: CrestSpec, g: Geo): { back: ReactNode; front: ReactNode } {
  const { c1, c2, glow } = spec;
  const top = g.y;
  const L = g.x;
  const R = g.x + g.w;
  const mid = g.x + g.w / 2;
  switch (spec.motif) {
    case "wings": {
      const v = spec.variant ?? "raven";
      const feathered = v === "raven" || v === "angel" || v === "ash" || v === "crow";
      const edge = v === "angel" ? "#fffaf0" : v === "ash" ? "#b0806a" : v === "raven" ? "#a48ce8" : v === "crow" ? "#a8a4b8" : glow;
      // Shoulders behind the box's top, the wing sweeping out over its corner and up behind the name.
      const wing = (flip: boolean) => {
        const a: Pt = [L + g.w * 0.32, top + 12];
        const reach = Math.min(g.w * 0.36 + 14, 76);
        if (!feathered) {
          const knuckle = at(a, -128, 20);
          const tips: Pt[] = [at(a, -100, 50), at(a, -130, reach + 8), at(a, -155, reach + 6), at(a, -176, reach)];
          const membrane = tips.map((t, i) => (i ? `Q${pt(at([(tips[i - 1]![0] + t[0]) / 2, (tips[i - 1]![1] + t[1]) / 2], (Math.atan2(t[1] - a[1], t[0] - a[0]) * 180) / Math.PI + 70, -9))} ${pt(t)}` : `L${pt(t)}`)).join(" ");
          return (
            <g className="cs-wing" style={{ ...origin(a), ...delay(flip ? 0.2 : 0) }}>
              <path d={`M${pt(a)} L${pt(knuckle)} ${membrane} Q${pt(at(a, 170, 12))} ${pt(a)} Z`} fill={c1} stroke={c2} strokeWidth={1} strokeLinejoin="round" />
              {tips.map((t, i) => (
                <path key={i} d={`M${pt(knuckle)} L${pt(t)}`} stroke={c2} strokeWidth={1.8} strokeLinecap="round" />
              ))}
              <path d={`M${pt(a)} L${pt(knuckle)}`} stroke={c2} strokeWidth={3} strokeLinecap="round" />
              <path d={`M${pt(knuckle)} l-2 -5 l3 2 Z`} fill={edge} />
              {v === "dragon" && [0.35, 0.55, 0.75].map((t, i) => {
                const p: Pt = [a[0] + (tips[1]![0] - a[0]) * t, a[1] + (tips[1]![1] - a[1]) * t];
                return <path key={`s${i}`} className="cs-sheen" style={delay(i * 0.4)} d={`M${pt([p[0] - 3, p[1] + 3])} q3 -5 6 0`} stroke={edge} strokeWidth={0.9} fill="none" />;
              })}
            </g>
          );
        }
        // A raised wing: its leading edge arcs from the shoulder up and out, the feathers hang from it towards the box's corner.
        const hand: Pt = [L - 4, top - 54];
        const ctrl: Pt = [a[0] + 2, top - 58];
        const arm = (t: number): Pt => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * ctrl[0] + t * t * hand[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * ctrl[1] + t * t * hand[1]];
        const row = (n: number, lenOf: (t: number) => number, wide: number, fill: string, key: string, rachis = false) =>
          Array.from({ length: n }, (_, i) => {
            const t = 0.08 + (i / (n - 1)) * 0.92;
            const p = arm(t);
            const deg = 168 - 58 * Math.pow(t, 1.4);
            const len = lenOf(t) + (v === "crow" && i % 3 === 1 ? -8 : 0);
            const bend = v === "crow" ? (i % 2 ? 8 : -5) : 6;
            return (
              <g key={`${key}${i}`}>
                <path d={feather(p, deg, len, wide, bend)} fill={fill} stroke={edge} strokeWidth={0.7} strokeOpacity={0.85} />
                {rachis && <path d={`M${pt(at(p, deg, len * 0.15))} L${pt(at(p, deg + bend * 0.8, len * 0.9))}`} stroke={edge} strokeWidth={0.6} opacity={0.45} />}
              </g>
            );
          }).reverse();
        const lead = `M${pt(a)} Q${pt(ctrl)} ${pt(hand)}`;
        return (
          <g className="cs-wing" style={{ ...origin(a), ...delay(flip ? 0.2 : 0) }}>
            {row(11, (t) => 22 + 30 * t, 13, c1, "p", true)}
            {row(8, (t) => 12 + 14 * t, 12, c2, "c")}
            <path d={lead} stroke={c2} strokeWidth={5} fill="none" strokeLinecap="round" />
            <path className="cs-sheen" d={lead} stroke={glow} strokeWidth={1.4} fill="none" strokeLinecap="round" />
          </g>
        );
      };
      return {
        back: (
          <>
            {both(g, wing)}
            {v === "raven" && <path className="cs-drift" d={blade([mid + 4, top - 30], 75, 15, 5, 12)} fill={c2} stroke={edge} strokeWidth={0.6} style={origin([mid + 4, top - 30])} />}
            {v === "ash" && [0, 1, 2, 3].map((i) => <circle key={i} className="cs-ember" cx={L + g.w * (0.2 + i * 0.2)} cy={top - 4} r={1.5} fill={glow} style={delay(i * 0.8)} />)}
            {v === "angel" && <ellipse className="cs-halo" cx={mid} cy={top - 50} rx={18} ry={4.5} fill="none" stroke={glow} strokeWidth={2} />}
          </>
        ),
        // The shoulders hold the box's top edge.
        front: both(g, () => <path d={`M${pt([L + g.w * 0.3 - 13, top + 1])} Q${pt([L + g.w * 0.3, top - 7])} ${pt([L + g.w * 0.3 + 13, top + 1])}`} stroke={c2} strokeWidth={3} fill="none" strokeLinecap="round" />),
      };
    }
    case "horns": {
      const horn = (flip: boolean) => {
        const b: Pt = [L + 24, top + 6];
        const P = (dx: number, dy: number) => pt([b[0] + dx, b[1] + dy]);
        const d = `M${P(-12, 0)} C${P(-24, -30)} ${P(-8, -58)} ${P(18, -56)} C${P(34, -54)} ${P(34, -36)} ${P(22, -36)} C${P(26, -44)} ${P(12, -46)} ${P(6, -36)} C${P(-2, -24)} ${P(6, -10)} ${P(12, 0)} Z`;
        return (
          <g>
            <path d={d} fill={c1} stroke={c2} strokeWidth={1.2} />
            {[0, 1, 2, 3, 4].map((i) => (
              <path key={i} d={`M${P(-11 + i * 0.6, -8 - i * 9)} q9 -4 ${18 - i * 1.5} ${-1 + i * 1.4}`} stroke={c2} strokeWidth={1.4} fill="none" />
            ))}
            <circle className="cs-ember" cx={b[0] + 24} cy={b[1] - 42} r={1.6} fill={glow} style={delay(flip ? 1.3 : 0)} />
            <circle className="cs-ember" cx={b[0] + 10} cy={b[1] - 50} r={1.2} fill={glow} style={delay(flip ? 0.4 : 2)} />
          </g>
        );
      };
      return {
        back: (
          <>
            <ellipse className="cs-glow" cx={mid} cy={top - 6} rx={g.w * 0.42} ry={12} fill={glow} opacity={0.18} />
            {both(g, horn)}
          </>
        ),
        front: both(g, () => <path d={`M${pt([L + 12, top + 1])} L${pt([L + 36, top + 1])}`} stroke={c1} strokeWidth={4} strokeLinecap="round" />),
      };
    }
    case "laurel":
    case "vines": {
      const laurel = spec.motif === "laurel";
      const v = spec.variant;
      // A branch along the left side and the top, its end lifting up behind the name.
      const pts: Pt[] = [];
      const n = 48;
      const sideLen = g.h * 0.85;
      const topLen = g.w * (laurel ? 0.5 : 0.62);
      for (let i = 0; i <= n; i++) {
        const s = (i / n) * (sideLen + topLen);
        const wob = laurel ? 0 : Math.sin((s / (sideLen + topLen)) * Math.PI * 6) * 2.2;
        if (s <= sideLen) pts.push([L - 3 + wob, top + sideLen - s]);
        else {
          const u = (s - sideLen) / topLen;
          pts.push([L + (s - sideLen), top - 3 + wob - Math.pow(u, 2.2) * (laurel ? 26 : 14)]);
        }
      }
      const path = `M${pts.map(pt).join(" L")}`;
      const leafAt = (i: number) => {
        const p = pts[i]!;
        const q = pts[Math.min(n, i + 1)]!;
        return { p, dir: (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI };
      };
      const leafCol = (i: number) => (v === "autumn" ? [c1, c2, "#8a3a1a"][i % 3]! : v === "leaf" && laurel ? (i % 2 ? c1 : "#7fa94f") : i % 3 === 2 ? c2 : c1);
      const leaves: ReactNode[] = [];
      const step = laurel ? 3 : 4;
      for (let i = 3, k = 0; i < n - 1; i += step, k++) {
        const { p, dir } = leafAt(i);
        const size = laurel ? 12 - (i / n) * 3 : 13;
        const sides = laurel ? [-1, 1] : [k % 2 ? -1 : 1];
        for (const sd of sides)
          leaves.push(<path key={`${i}${sd}`} className="cs-leaf" style={{ ...origin(p), ...delay(k * 0.35) }} d={blade(p, dir + sd * (laurel ? 38 : 55), size, laurel ? 5.5 : 8, sd * 4)} fill={leafCol(k + (sd > 0 ? 1 : 0))} stroke={laurel ? c2 : "none"} strokeWidth={0.5} />);
      }
      // Laurel on both sides: the second branch from the right, shorter.
      const right = laurel ? (
        <g transform={`translate(${f(mid * 2)} 0) scale(-1 1)`}>
          <path d={path} stroke={c2} strokeWidth={2} fill="none" />
          {leaves}
        </g>
      ) : null;
      const tendrils = laurel
        ? null
        : [0.3, 0.75].map((t, i) => {
            const p: Pt = [L + g.w * t * 0.62, top - 3];
            return <path key={`t${i}`} className="cs-leaf" style={{ ...origin(p), ...delay(i) }} d={`M${pt(p)} q-2 -12 6 -14 q6 -1 5 5 q-1 4 -4 2`} stroke={c2} strokeWidth={1.2} fill="none" />;
          });
      return {
        back: (
          <>
            {right}
            <path d={path} stroke={laurel ? c2 : c2} strokeWidth={laurel ? 2 : 3} fill="none" strokeLinecap="round" />
            {tendrils}
            {leaves}
            {v === "blossom" &&
              [8, 20, 31, 41].map((i, k) => {
                const p = pts[i]!;
                return (
                  <g key={`b${k}`} className="cs-bloom" style={{ ...origin(p), ...delay(k * 0.7) }}>
                    {[0, 72, 144, 216, 288].map((d) => (
                      <circle key={d} cx={at(p, d - 90, 3.6)[0]} cy={at(p, d - 90, 3.6)[1]} r={3.2} fill={c2} stroke="#d47aa5" strokeWidth={0.4} />
                    ))}
                    <circle cx={p[0]} cy={p[1]} r={1.8} fill="#ffe08a" />
                  </g>
                );
              })}
            {v === "autumn" &&
              [0, 1, 2].map((i) => {
                const p: Pt = [L + g.w * (0.45 + i * 0.18), top - 44 + i * 6];
                return <path key={`f${i}`} className="cs-fall" style={{ ...origin(p), ...delay(i * 2.1) }} d={blade(p, 60, 11, 7)} fill={[c1, c2, "#8a3a1a"][i]} />;
              })}
            {laurel && <circle className="cs-twinkle" style={origin(pts[n]!)} cx={pts[n]![0]} cy={pts[n]![1]} r={2.4} fill={glow} />}
          </>
        ),
        // Woven: the branch crosses over the border here and there.
        front: <path d={path} stroke={laurel ? c2 : c2} strokeWidth={laurel ? 2 : 3} fill="none" strokeLinecap="round" pathLength={100} strokeDasharray="0 6 8 10" />,
      };
    }
    case "stars": {
      const moon: Pt = [R - 30, top - 14];
      const r = 17;
      const stars: [number, number, number][] = [
        [L + 10, top - 34, 5],
        [L + g.w * 0.36, top - 46, 3.5],
        [L + g.w * 0.5, top - 24, 4.5],
        [L + g.w * 0.66, top - 44, 3],
        [L - 4, top - 6, 3],
        [R - 4, top - 40, 3],
      ];
      return {
        back: (
          <>
            <circle className="cs-glow" cx={moon[0]} cy={moon[1]} r={r + 8} fill={glow} opacity={0.12} />
            <path d={`M${pt([moon[0] + r * 0.6, moon[1] - r * 0.8])} A${r} ${r} 0 1 0 ${pt([moon[0] + r * 0.6, moon[1] + r * 0.8])} A${r * 0.82} ${r * 0.82} 0 1 1 ${pt([moon[0] + r * 0.6, moon[1] - r * 0.8])} Z`} fill={c1} stroke={glow} strokeWidth={0.8} />
            <path d={`M${pt([L - 6, top + 22])} C${pt([L - 8, top - 10])} ${pt([L + g.w * 0.3, top - 30])} ${pt([moon[0] - r - 2, moon[1]])}`} stroke={c2} strokeWidth={1.4} fill="none" />
            <path d={`M${pt([L - 2, top + 8])} C${pt([L + 10, top - 16])} ${pt([L + g.w * 0.4, top - 14])} ${pt([moon[0] - r + 2, moon[1] + 12])}`} stroke={c2} strokeWidth={1} fill="none" strokeDasharray="2 4" />
            {stars.map(([x, y, s], i) => (
              <path key={i} className="cs-twinkle" style={{ ...origin([x, y]), ...delay(i * 0.55) }} d={star4([x, y], s)} fill={glow} />
            ))}
          </>
        ),
        front: <path d={`M${pt([L - 6, top + 22])} C${pt([L - 7, top + 10])} ${pt([L - 5, top + 2])} ${pt([L + 4, top - 4])}`} stroke={c2} strokeWidth={1.4} fill="none" />,
      };
    }
    case "web": {
      const o: Pt = [L + 4, top + 4];
      const spokes = [-80, -100, -122, -144, -166, -188];
      const radii = [12, 24, 37, 50];
      const sp: Pt = [R - 34, top - 20];
      return {
        back: (
          <>
            {spokes.map((d) => (
              <path key={d} d={`M${pt(o)} L${pt(at(o, d, 58))}`} stroke={c1} strokeWidth={0.9} opacity={0.8} />
            ))}
            {radii.map((rr) => (
              <path key={rr} d={`M${spokes.map((d, i) => (i ? `Q${pt(at(o, d - 11, rr * 0.86))} ${pt(at(o, d, rr))}` : pt(at(o, d, rr)))).join(" ")}`} stroke={c1} strokeWidth={0.8} fill="none" opacity={0.75} />
            ))}
            <g className="cs-spider">
              <path d={`M${pt([sp[0], 0])} L${pt([sp[0], sp[1]])}`} stroke={c1} strokeWidth={0.7} />
              {[-1, 1].map((s) =>
                [0, 1, 2, 3].map((i) => <path key={`${s}${i}`} d={`M${pt([sp[0], sp[1] + 2 + i * 1.6])} q${s * 5} ${-4 + i * 2} ${s * 9} ${-1 + i * 3}`} stroke={c2} strokeWidth={0.9} fill="none" />),
              )}
              <ellipse cx={sp[0]} cy={sp[1] + 5} rx={4} ry={5} fill={c2} />
              <circle cx={sp[0]} cy={sp[1]} r={2.6} fill={c2} />
              <circle cx={sp[0] - 1} cy={sp[1] - 0.5} r={0.7} fill={glow} />
              <circle cx={sp[0] + 1} cy={sp[1] - 0.5} r={0.7} fill={glow} />
            </g>
          </>
        ),
        front: (
          <>
            {[-20, 10].map((d) => (
              <path key={d} d={`M${pt(o)} L${pt(at(o, d, 22))}`} stroke={c1} strokeWidth={0.8} opacity={0.8} />
            ))}
            <path d={`M${pt(at(o, -20, 12))} Q${pt(at(o, -5, 11))} ${pt(at(o, 10, 12))}`} stroke={c1} strokeWidth={0.7} fill="none" opacity={0.8} />
          </>
        ),
      };
    }
    case "runes":
    case "peaks": {
      if (spec.motif === "peaks") {
        const ridge: Pt[] = [
          [L - 10, top + 6],
          [L + 16, top - 30],
          [L + 30, top - 18],
          [L + 54, top - 50],
          [L + 78, top - 24],
          [L + g.w * 0.62, top - 38],
          [R - 18, top - 16],
          [R + 6, top + 6],
        ];
        const snow = [1, 3, 5].map((i) => {
          const p = ridge[i]!;
          return <path key={i} d={`M${pt([p[0] - 9, p[1] + 11])} L${pt(p)} L${pt([p[0] + 9, p[1] + 11])} L${pt([p[0] + 4, p[1] + 8])} L${pt([p[0], p[1] + 12])} L${pt([p[0] - 4, p[1] + 8])} Z`} fill={c2} />;
        });
        return {
          back: (
            <>
              <path d={`M${ridge.map(pt).join(" L")} Z`} fill={c1} stroke="#9aa5b0" strokeWidth={0.8} />
              {snow}
              {[0, 1, 2, 3].map((i) => <circle key={i} className="cs-snow" cx={L + 20 + i * 36} cy={top - 50} r={1.4} fill={glow} style={delay(i * 1.4)} />)}
            </>
          ),
          front: <path d={`M${pt([L + 2, top + 1])} Q${pt([L + 20, top - 3])} ${pt([L + 40, top + 1])} T${pt([L + 80, top + 1])}`} stroke={c2} strokeWidth={3} fill="none" strokeLinecap="round" />,
        };
      }
      // A carved stone lintel over the box, its runes glowing in turn.
      const h = 22;
      const slab = `M${pt([L - 6, top + 10])} L${pt([L - 6, top - h + 4])} L${pt([L + 2, top - h])} ${[0.2, 0.4, 0.6, 0.8].map((t) => `L${pt([L + g.w * t - 6, top - h])} L${pt([L + g.w * t - 6, top - h - 6])} L${pt([L + g.w * t + 6, top - h - 6])} L${pt([L + g.w * t + 6, top - h])}`).join(" ")} L${pt([R - 2, top - h])} L${pt([R + 4, top - h + 4])} L${pt([R + 4, top + 10])} Z`;
      const glyph = (p: Pt, i: number) =>
        [
          `M${pt([p[0], p[1] - 6])} l0 12 M${pt([p[0], p[1] - 6])} l5 4 l-5 4`,
          `M${pt([p[0] - 4, p[1] + 6])} l4 -12 l4 12 M${pt([p[0] - 2, p[1] + 1])} l4 0`,
          `M${pt([p[0] - 4, p[1] - 6])} l8 12 M${pt([p[0] + 4, p[1] - 6])} l-8 12`,
          `M${pt([p[0], p[1] - 6])} l0 12 M${pt([p[0] - 4, p[1] - 2])} l4 -4 l4 4`,
          `M${pt([p[0] - 4, p[1] - 6])} l0 12 l8 -6 Z`,
        ][i % 5]!;
      return {
        back: (
          <>
            <path d={slab} fill={c1} stroke={c2} strokeWidth={1.4} strokeLinejoin="round" />
            <path d={`M${pt([L - 2, top - 3])} L${pt([R, top - 3])}`} stroke={c2} strokeWidth={1} />
            {[0.12, 0.31, 0.5, 0.69, 0.88].map((t, i) => (
              <path key={i} className="cs-rune" style={delay(i * 0.7)} d={glyph([L + g.w * t, top - h / 2 - 2], i)} stroke={glow} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </>
        ),
        // The lintel's ends rest on the box's corners.
        front: (
          <>
            <rect x={L - 6} y={top - 3} width={11} height={13} rx={1.5} fill={c1} stroke={c2} strokeWidth={1.2} />
            <rect x={R - 7} y={top - 3} width={11} height={13} rx={1.5} fill={c1} stroke={c2} strokeWidth={1.2} />
          </>
        ),
      };
    }
    case "gears": {
      const gs: [number, number, number, number, string][] = [
        [R - 22, top - 4, 20, 12, "cs-spin"],
        [R - 58, top - 26, 13, 9, "cs-spin-back"],
        [L + 14, top - 14, 15, 10, "cs-spin-back"],
        [L + 40, top - 32, 8, 7, "cs-spin"],
      ];
      return {
        back: (
          <>
            {gs.map(([x, y, r, t, cls], i) => (
              <g key={i} className={cls} style={origin([x, y])}>
                <path d={gear(x, y, r, t)} fill={i % 2 ? c2 : c1} fillRule="evenodd" stroke="#5a3f14" strokeWidth={0.8} />
                <circle cx={x} cy={y} r={r * 0.72} fill="none" stroke={glow} strokeWidth={0.7} opacity={0.5} />
              </g>
            ))}
            <path d={`M${pt([L + 28, top - 12])} Q${pt([mid, top - 4])} ${pt([R - 70, top - 24])}`} stroke={c2} strokeWidth={2} fill="none" strokeDasharray="2 3" />
          </>
        ),
        front: <path d={`M${pt([R - 34, top + 1])} L${pt([R - 6, top + 1])}`} stroke={c1} strokeWidth={3.5} strokeLinecap="round" />,
      };
    }
    case "crystals":
    case "shards": {
      if (spec.motif === "shards") {
        const rocks: [number, number, number, number][] = [
          [L + 12, top - 14, 13, 0],
          [L + g.w * 0.32, top - 36, 10, 1],
          [L + g.w * 0.54, top - 16, 15, 2],
          [L + g.w * 0.76, top - 40, 9, 3],
          [R - 14, top - 12, 12, 4],
        ];
        return {
          back: (
            <>
              {rocks.map(([x, y, r, i]) => {
                const ps = [0, 1, 2, 3, 4, 5].map((k) => at([x, y], k * 60 + i * 17, r * (k % 2 ? 0.75 : 1)));
                return (
                  <g key={i} className="cs-bob" style={delay(i * 0.6)}>
                    <path d={`M${ps.map(pt).join(" L")} Z`} fill={i % 2 ? c2 : c1} stroke="#3a2f22" strokeWidth={0.8} />
                    <path d={`M${pt(ps[0]!)} L${pt([x, y])} L${pt(ps[3]!)}`} stroke={glow} strokeWidth={0.7} fill="none" opacity={0.7} />
                  </g>
                );
              })}
            </>
          ),
          front: <path d={`M${pt([L + 4, top + 1])} l8 -3 l6 3 l7 -2`} stroke={c1} strokeWidth={2.5} fill="none" strokeLinejoin="round" />,
        };
      }
      const prism = (b: Pt, deg: number, len: number, wide: number, i: number) => {
        const tip = at(b, deg, len);
        const sh = at(b, deg, len - wide);
        const l = at(b, deg - 90, wide / 2);
        const r = at(b, deg + 90, wide / 2);
        const ls = at(sh, deg - 90, wide / 2);
        const rs = at(sh, deg + 90, wide / 2);
        return (
          <g key={i}>
            <path d={`M${pt(l)} L${pt(ls)} L${pt(tip)} L${pt(rs)} L${pt(r)} Z`} fill={i % 2 ? c2 : c1} stroke={glow} strokeWidth={0.6} strokeOpacity={0.7} />
            <path d={`M${pt(b)} L${pt(sh)} L${pt(tip)}`} stroke={glow} strokeWidth={0.6} opacity={0.6} fill="none" />
          </g>
        );
      };
      const cluster = (flip: boolean) => (
        <g>
          {prism([L + 10, top + 6], -112, 44, 10, 0)}
          {prism([L + 18, top + 6], -82, 32, 9, 1)}
          {prism([L + 4, top + 8], -140, 28, 8, 2)}
          {prism([L + 28, top + 6], -66, 20, 7, 3)}
          <path className="cs-twinkle" style={{ ...origin(at([L + 10, top + 6], -112, 40)), ...delay(flip ? 1.4 : 0) }} d={star4(at([L + 10, top + 6], -112, 40), 4)} fill={glow} />
        </g>
      );
      return { back: both(g, cluster), front: both(g, () => <path d={`M${pt([L + 4, top + 1])} L${pt([L + 30, top + 1])}`} stroke={c1} strokeWidth={3} strokeLinecap="round" />) };
    }
    case "flames":
    case "sun": {
      if (spec.motif === "sun") {
        const o: Pt = [mid, top + 8];
        return {
          back: (
            <>
              <circle className="cs-glow" cx={o[0]} cy={o[1]} r={44} fill={glow} opacity={0.15} />
              <g className="cs-rays" style={origin(o)}>
                {Array.from({ length: 24 }, (_, i) => {
                  const d = i * 15;
                  return <path key={i} d={`M${pt(at(o, d - 4, 24))} L${pt(at(o, d, i % 2 ? 42 : 58))} L${pt(at(o, d + 4, 24))} Z`} fill={i % 2 ? c2 : c1} />;
                })}
              </g>
              <circle cx={o[0]} cy={o[1]} r={24} fill={c1} stroke={c2} strokeWidth={1.5} />
            </>
          ),
          front: <path d={`M${pt([mid - 20, top + 1])} L${pt([mid + 20, top + 1])}`} stroke={c2} strokeWidth={3} strokeLinecap="round" />,
        };
      }
      const radiant = spec.variant === "radiant";
      const flame = (x: number, hgt: number, w: number, i: number) => {
        const base: Pt = [x, top + 8];
        const lean = i % 2 ? 4 : -4;
        const outer = `M${pt([x - w, top + 8])} C${pt([x - w * 1.1, top - hgt * 0.4])} ${pt([x + lean - 2, top - hgt * 0.6])} ${pt([x + lean, top - hgt])} C${pt([x + lean + 3, top - hgt * 0.55])} ${pt([x + w * 1.1, top - hgt * 0.35])} ${pt([x + w, top + 8])} Z`;
        const inner = `M${pt([x - w * 0.5, top + 8])} C${pt([x - w * 0.6, top - hgt * 0.25])} ${pt([x + lean * 0.5, top - hgt * 0.4])} ${pt([x + lean * 0.6, top - hgt * 0.62])} C${pt([x + lean * 0.6 + 2, top - hgt * 0.35])} ${pt([x + w * 0.6, top - hgt * 0.2])} ${pt([x + w * 0.5, top + 8])} Z`;
        return (
          <g key={i} className="cs-flicker" style={{ ...origin(base), ...delay((i * 0.29) % 1.1) }}>
            <path d={outer} fill={radiant ? c2 : c1} opacity={0.95} />
            <path d={inner} fill={radiant ? c1 : c2} />
          </g>
        );
      };
      const xs = [0.04, 0.2, 0.36, 0.52, 0.68, 0.84, 0.98];
      const hs = [30, 44, 28, 50, 32, 42, 26];
      return {
        back: (
          <>
            {radiant && <ellipse className="cs-glow" cx={mid} cy={top} rx={g.w * 0.55} ry={22} fill={glow} opacity={0.25} />}
            {xs.map((t, i) => flame(L + g.w * t, hs[i]!, 10, i))}
            {[0, 1, 2, 3].map((i) => <circle key={i} className="cs-ember" cx={L + g.w * (0.15 + i * 0.23)} cy={top - 30} r={1.5} fill={glow} style={delay(i * 0.7)} />)}
          </>
        ),
        front: (
          <>
            {[0.12, 0.6].map((t, i) => (
              <path key={i} d={`M${pt([L + g.w * t - 7, top + 1])} Q${pt([L + g.w * t, top - 9])} ${pt([L + g.w * t + 7, top + 1])}`} fill={radiant ? c2 : c1} />
            ))}
          </>
        ),
      };
    }
    case "waves": {
      // A great wave curling over the top-left corner, a smaller one at the right.
      const wave = (x0: number, w: number, hgt: number) => {
        const P = (dx: number, dy: number) => pt([x0 + dx * w, top + dy * hgt]);
        return `M${P(0, 0.35)} C${P(0.02, -0.4)} ${P(0.25, -1)} ${P(0.5, -1)} C${P(0.7, -1)} ${P(0.78, -0.75)} ${P(0.7, -0.55)} C${P(0.62, -0.42)} ${P(0.5, -0.55)} ${P(0.56, -0.68)} C${P(0.46, -0.66)} ${P(0.42, -0.4)} ${P(0.6, -0.25)} C${P(0.75, -0.12)} ${P(0.9, -0.1)} ${P(1, 0.15)} L${P(1, 0.35)} Z`;
      };
      const big = wave(L - 10, g.w * 0.62, 46);
      const small = wave(L + g.w * 0.55, g.w * 0.42, 28);
      return {
        back: (
          <>
            <path className="cs-swell" style={delay(0.8)} d={small} fill={c2} stroke={c1} strokeWidth={1.4} />
            <path className="cs-swell" d={big} fill={c2} stroke={c1} strokeWidth={2} />
            <path d={big} fill="none" stroke={glow} strokeWidth={1} strokeDasharray="1 5" opacity={0.9} />
            {[0, 1, 2].map((i) => <circle key={i} className="cs-bubble" cx={L + g.w * (0.42 + i * 0.12)} cy={top - 6} r={1.8 + i * 0.6} fill="none" stroke={glow} strokeWidth={0.9} style={delay(i * 0.9)} />)}
          </>
        ),
        front: <path d={`M${pt([L - 6, top + 6])} Q${pt([L + 8, top - 4])} ${pt([L + 24, top + 2])} T${pt([L + 54, top + 1])}`} stroke={c1} strokeWidth={3} fill="none" strokeLinecap="round" />,
      };
    }
    case "wind": {
      const curl = (x: number, y: number, r: number) => `M${pt([x - r * 3.2, y + r * 1.1])} C${pt([x - r * 1.5, y + r * 1.2])} ${pt([x + r, y + r])} ${pt([x + r, y])} C${pt([x + r, y - r * 0.8])} ${pt([x, y - r])} ${pt([x - r * 0.4, y - r * 0.4])} C${pt([x - r * 0.7, y])} ${pt([x - r * 0.2, y + r * 0.4])} ${pt([x + r * 0.2, y + r * 0.1])}`;
      const streams = [
        `M${pt([L - 12, top + 20])} C${pt([L - 4, top - 8])} ${pt([L + g.w * 0.3, top - 6])} ${pt([L + g.w * 0.55, top - 18])}`,
        `M${pt([L + 4, top - 2])} C${pt([L + g.w * 0.3, top - 30])} ${pt([L + g.w * 0.6, top - 36])} ${pt([R - 30, top - 30])}`,
      ];
      return {
        back: (
          <>
            {[curl(L + g.w * 0.62, top - 22, 9), curl(R - 22, top - 34, 7), curl(L + 18, top - 30, 6)].map((d, i) => (
              <path key={i} className="cs-sway" style={{ ...origin([L + g.w * 0.5, top - 20]), ...delay(i * 0.8) }} d={d} stroke={i === 1 ? c2 : c1} strokeWidth={2.4 - i * 0.4} fill="none" strokeLinecap="round" />
            ))}
            {streams.map((d, i) => (
              <path key={`s${i}`} className="cs-flow" d={d} stroke={c1} strokeWidth={1.8} fill="none" strokeLinecap="round" pathLength={100} strokeDasharray="34 14" opacity={0.85} style={delay(i * 1.2)} />
            ))}
          </>
        ),
        front: <path className="cs-flow" d={`M${pt([L - 12, top + 20])} C${pt([L - 8, top + 10])} ${pt([L - 4, top + 2])} ${pt([L + 8, top - 2])}`} stroke={c1} strokeWidth={1.8} fill="none" strokeLinecap="round" />,
      };
    }
    case "tusks": {
      const tusk = () => {
        const b: Pt = [L + 20, top + 8];
        const P = (dx: number, dy: number) => pt([b[0] + dx, b[1] + dy]);
        return (
          <g>
            <path d={`M${P(-9, 0)} C${P(-18, -24)} ${P(-10, -44)} ${P(10, -52)} C${P(-2, -38)} ${P(-2, -18)} ${P(9, 0)} Z`} fill={c1} stroke="#9a8a6a" strokeWidth={1} />
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M${P(-8 + i, -8 - i * 11)} q6 -2 ${11 - i * 2} ${1}`} stroke="#b9a882" strokeWidth={1} fill="none" />
            ))}
          </g>
        );
      };
      return {
        back: (
          <>
            {both(g, tusk)}
            {[0, 1, 2].map((i) => (
              <path key={i} className="cs-glow" style={delay(i * 0.4)} d={`M${pt([mid - 14 + i * 10, top - 4])} l9 -24`} stroke={c2} strokeWidth={4} strokeLinecap="round" />
            ))}
          </>
        ),
        front: both(g, () => <path d={`M${pt([L + 9, top + 1])} L${pt([L + 31, top + 1])}`} stroke={c1} strokeWidth={4} strokeLinecap="round" />),
      };
    }
    case "spikes": {
      const v = spec.variant;
      const n = v === "teeth" ? 9 : 7;
      const items = Array.from({ length: n }, (_, i) => {
        const x = L + 4 + (i / (n - 1)) * (g.w - 8);
        const big = i % 2 === 0;
        const hgt = v === "fur" ? 16 + (i % 3) * 6 : v === "teeth" ? 14 + (big ? 8 : 0) : big ? 34 : 20;
        const w = v === "teeth" ? 5 : 7;
        const lean = v === "fur" ? (i % 2 ? 6 : -5) : v === "teeth" ? (i < n / 2 ? 3 : -3) : 0;
        if (v === "fur")
          return <path key={i} d={`M${pt([x - w, top + 6])} Q${pt([x - 2, top - hgt * 0.5])} ${pt([x + lean, top - hgt])} Q${pt([x + 2, top - hgt * 0.4])} ${pt([x + w, top + 6])} Z`} fill={i % 2 ? c2 : c1} />;
        return (
          <g key={i}>
            <path d={`M${pt([x - w, top + 6])} L${pt([x + lean, top - hgt])} L${pt([x + w, top + 6])} Z`} fill={i % 2 ? c2 : c1} stroke="#2a2420" strokeWidth={0.8} />
            {v !== "teeth" && <path d={`M${pt([x + lean, top - hgt])} L${pt([x + 1, top + 4])}`} stroke={glow} strokeWidth={0.6} opacity={0.6} />}
          </g>
        );
      });
      return {
        back: (
          <>
            {v === "teeth" && [0.1, 0.9].map((t, i) => <path key={i} className="cs-sway" style={origin([L + g.w * t, top])} d={`M${pt([L + g.w * t, top + 4])} Q${pt([L + g.w * t + (i ? 6 : -6), top - 30])} ${pt([L + g.w * t + (i ? -2 : 2), top - 48])}`} stroke={c2} strokeWidth={2.4} fill="none" />)}
            <path d={`M${pt([L - 2, top + 3])} L${pt([R + 2, top + 3])}`} stroke={v === "teeth" ? c2 : "#3a3430"} strokeWidth={6} strokeLinecap="round" />
            {items}
            {v !== "fur" && <path className="cs-sheen" d={`M${pt([L + 4, top - 8])} L${pt([R - 4, top - 8])}`} stroke={glow} strokeWidth={1.4} pathLength={100} strokeDasharray="8 92" />}
            {spec.label === "Iron spikes" && <path className="cs-sway" style={origin([mid, top - 34])} d={`M${pt([mid, top - 34])} l0 -12 l12 3 l-12 4`} fill={c2} stroke="#2a2420" strokeWidth={0.6} />}
          </>
        ),
        front: <path d={`M${pt([L + 2, top + 1])} L${pt([R - 2, top + 1])}`} stroke={v === "teeth" ? c2 : "#4a4440"} strokeWidth={2.5} strokeLinecap="round" pathLength={100} strokeDasharray="5 9" />,
      };
    }
    case "serpent": {
      const body = `M${pt([L + 18, top + g.h + 4])} C${pt([L - 22, top + g.h * 0.9])} ${pt([L - 16, top - 8])} ${pt([L + 14, top - 6])} C${pt([L + 40, top - 4])} ${pt([L + g.w * 0.36, top + 10])} ${pt([L + g.w * 0.5, top - 4])} C${pt([L + g.w * 0.6, top - 16])} ${pt([L + g.w * 0.54, top - 34])} ${pt([L + g.w * 0.66, top - 38])}`;
      const head: Pt = [L + g.w * 0.66, top - 38];
      return {
        back: (
          <>
            <path d={body} stroke="#1f3a1c" strokeWidth={10} fill="none" strokeLinecap="round" />
            <path d={body} stroke={c1} strokeWidth={8} fill="none" strokeLinecap="round" />
            <path d={body} stroke={c2} strokeWidth={3} fill="none" strokeDasharray="3 5" />
            <g className="cs-head" style={origin(head)}>
              <path d={`M${pt([head[0] - 4, head[1] + 3])} Q${pt([head[0] + 2, head[1] - 8])} ${pt([head[0] + 13, head[1] - 2])} Q${pt([head[0] + 15, head[1] + 2])} ${pt([head[0] + 10, head[1] + 4])} Q${pt([head[0] + 2, head[1] + 6])} ${pt([head[0] - 4, head[1] + 3])} Z`} fill={c1} stroke="#1f3a1c" strokeWidth={1} />
              <circle cx={head[0] + 8} cy={head[1] - 2} r={1.4} fill={glow} />
              <path className="cs-tongue" style={origin([head[0] + 14, head[1] + 1])} d={`M${pt([head[0] + 14, head[1] + 1])} l6 0 l2 -2 M${pt([head[0] + 20, head[1] + 1])} l2 2`} stroke="#d0243b" strokeWidth={1} fill="none" />
            </g>
          </>
        ),
        // Coiled round the box: over the border on the left, under it at the top.
        front: (
          <>
            <path d={body} stroke="#1f3a1c" strokeWidth={10} fill="none" strokeLinecap="round" pathLength={100} strokeDasharray="0 4 22 100" />
            <path d={body} stroke={c1} strokeWidth={8} fill="none" strokeLinecap="round" pathLength={100} strokeDasharray="0 4 22 100" />
            <path d={body} stroke={c2} strokeWidth={3} fill="none" pathLength={100} strokeDasharray="0 6 1 1.6 1 1.6 1 1.6 1 1.6 1 1.6 1 1.6 1 1.6 1 100" />
          </>
        ),
      };
    }
    case "tail": {
      // Rising from behind the box's left side, curling over its corner and up behind the name.
      const tail = `M${pt([L + 10, top + g.h * 0.8])} C${pt([L - 22, top + g.h * 0.5])} ${pt([L - 12, top - 14])} ${pt([L + 14, top - 22])} C${pt([L + 36, top - 28])} ${pt([L + 44, top - 48])} ${pt([L + 30, top - 50])} C${pt([L + 22, top - 51])} ${pt([L + 20, top - 42])} ${pt([L + 26, top - 40])}`;
      const root: Pt = [L + 10, top + g.h * 0.5];
      return {
        back: (
          <g className="cs-flick" style={origin(root)}>
            <path d={tail} stroke={c1} strokeWidth={9} fill="none" strokeLinecap="round" />
            <path d={tail} stroke={c2} strokeWidth={9} fill="none" strokeLinecap="butt" pathLength={100} strokeDasharray="0 18 5 9 5 9 5 9 5 9 6 100" />
            <path d={tail} stroke="#f0d9a8" strokeWidth={2} fill="none" opacity={0.35} pathLength={100} strokeDasharray="60 100" />
          </g>
        ),
        front: <path d={tail} stroke={c1} strokeWidth={9} fill="none" strokeLinecap="round" pathLength={100} strokeDasharray="0 26 12 100" />,
      };
    }
    case "clover": {
      const clover = (c: Pt, r: number, cls: string, d: number, key: string) => (
        <g key={key} className={cls} style={{ ...origin(c), ...delay(d) }}>
          {[0, 90, 180, 270].map((a) => {
            const p = at(c, a - 45, r);
            return <path key={a} d={`M${pt(c)} C${pt(at(p, a - 135, r * 0.9))} ${pt(at(p, a - 45, r * 0.6))} ${pt(p)} C${pt(at(p, a + 45, r * 0.6))} ${pt(at(p, a + 135, r * 0.9))} ${pt(c)} Z`} fill={c1} stroke={c2} strokeWidth={0.7} />;
          })}
          <circle cx={c[0]} cy={c[1]} r={r * 0.22} fill={c2} />
        </g>
      );
      return {
        back: (
          <>
            <path d={`M${pt([L + 8, top + 8])} C${pt([L - 4, top - 10])} ${pt([L + 4, top - 24])} ${pt([L + 18, top - 32])}`} stroke={c2} strokeWidth={2} fill="none" />
            <path d={`M${pt([R - 10, top + 8])} C${pt([R, top - 6])} ${pt([R - 4, top - 18])} ${pt([R - 20, top - 24])}`} stroke={c2} strokeWidth={2} fill="none" />
            {clover([L + 18, top - 32], 11, "cs-sway", 0, "a")}
            {clover([R - 20, top - 24], 9, "cs-sway", 0.9, "b")}
            {clover([L + g.w * 0.56, top - 34], 6, "cs-spin-slow", 0, "c")}
            {[0.38, 0.72].map((t, i) => (
              <path key={i} className="cs-twinkle" style={{ ...origin([L + g.w * t, top - 18]), ...delay(i * 1.2) }} d={star4([L + g.w * t, top - 18], 4)} fill={glow} />
            ))}
          </>
        ),
        front: (
          <>
            <path d={`M${pt([L + 8, top + 8])} C${pt([L + 4, top + 2])} ${pt([L + 2, top - 2])} ${pt([L + 2, top - 6])}`} stroke={c2} strokeWidth={2} fill="none" />
            <path d={blade([L + 4, top + 2], -20, 10, 5)} fill={c1} />
          </>
        ),
      };
    }
    case "thorns": {
      const branch = (flip: boolean) => {
        const d = `M${pt([L - 4, top + g.h * 0.6])} C${pt([L - 10, top - 4])} ${pt([L + 20, top - 26])} ${pt([mid - 6, top - 30])}`;
        const pts: Pt[] = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((t) => {
          const x = L - 4 + (mid - 6 - (L - 4)) * t;
          return [x + (t < 0.3 ? -6 : 0), top + g.h * 0.6 - (g.h * 0.6 + 30) * Math.pow(t, 0.6)];
        });
        return (
          <g>
            <path d={d} stroke={c1} strokeWidth={4} fill="none" strokeLinecap="round" />
            {pts.map((p, i) => (
              <path key={i} d={`M${pt([p[0] - 2.5, p[1]])} L${pt(at(p, i % 2 ? -150 : -40, 11))} L${pt([p[0] + 2.5, p[1]])} Z`} fill={c1} />
            ))}
            <circle cx={pts[2]![0] + 3} cy={pts[2]![1] - 3} r={2.6} fill={c2} className="cs-bloom" style={{ ...origin([pts[2]![0] + 3, pts[2]![1] - 3]), ...delay(flip ? 1 : 0) }} />
          </g>
        );
      };
      const eye: Pt = [mid, top - 30];
      return {
        back: (
          <>
            {both(g, branch)}
            <ellipse className="cs-glow" cx={eye[0]} cy={eye[1]} rx={14} ry={9} fill={glow} opacity={0.15} />
            <g className="cs-blink" style={origin(eye)}>
              <path d={`M${pt([eye[0] - 11, eye[1]])} Q${pt([eye[0], eye[1] - 9])} ${pt([eye[0] + 11, eye[1]])} Q${pt([eye[0], eye[1] + 9])} ${pt([eye[0] - 11, eye[1]])} Z`} fill="#e8e1cf" stroke={c1} strokeWidth={1.4} />
              <circle cx={eye[0]} cy={eye[1]} r={4} fill={c2} />
              <circle cx={eye[0]} cy={eye[1]} r={1.6} fill={glow} />
            </g>
          </>
        ),
        front: both(g, () => <path d={`M${pt([L - 4, top + 10])} C${pt([L - 5, top + 4])} ${pt([L - 3, top - 2])} ${pt([L + 3, top - 7])}`} stroke={c1} strokeWidth={3} fill="none" strokeLinecap="round" />),
      };
    }
    case "wisps": {
      const seam = (pts: Pt[]) => (
        <>
          <path d={`M${pts.map(pt).join(" L")}`} stroke="#6a7a80" strokeWidth={1.4} fill="none" />
          {pts.slice(0, -1).map((p, i) => {
            const q = pts[i + 1]!;
            const m: Pt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
            const dir = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
            return <path key={i} d={`M${pt(at(m, dir + 90, 4))} L${pt(at(m, dir - 90, 4))}`} stroke={c1} strokeWidth={1.4} strokeLinecap="round" />;
          })}
        </>
      );
      return {
        back: (
          <>
            {[0, 1, 2, 3].map((i) => {
              const x = L + g.w * (0.12 + i * 0.26);
              return <path key={i} className="cs-wisp" style={delay(i * 1.1)} d={`M${pt([x, top])} C${pt([x - 12, top - 12])} ${pt([x + 10, top - 22])} ${pt([x - 2, top - 38])}`} stroke={glow} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.65} />;
            })}
          </>
        ),
        // A stitched seam across the box's corners, as if sewn on.
        front: (
          <>
            {seam([
              [L - 4, top + 20],
              [L + 4, top + 4],
              [L + 18, top - 2],
              [L + 34, top + 2],
            ])}
            {seam([
              [R - 30, top - 2],
              [R - 14, top + 3],
              [R + 2, top + 12],
            ])}
          </>
        ),
      };
    }
    case "frost": {
      const flake = (c: Pt, r: number) => (
        <g>
          {[0, 60, 120].map((a) => (
            <path key={a} d={`M${pt(at(c, a, r))} L${pt(at(c, a + 180, r))}`} stroke={c1} strokeWidth={1.4} strokeLinecap="round" />
          ))}
          {[0, 60, 120, 180, 240, 300].map((a) => {
            const m = at(c, a, r * 0.55);
            return <path key={`b${a}`} d={`M${pt(at(m, a + 45, r * 0.32))} L${pt(m)} L${pt(at(m, a - 45, r * 0.32))}`} stroke={c1} strokeWidth={1} fill="none" />;
          })}
        </g>
      );
      const crystal = (flip: boolean) => (
        <g>
          {[-100, -125, -150, -75].map((d, i) => {
            const b: Pt = [L + 10, top + 4];
            const tip = at(b, d, [34, 26, 18, 16][i]!);
            return <path key={i} d={`M${pt(at(b, d - 90, 3.5))} L${pt(tip)} L${pt(at(b, d + 90, 3.5))} Z`} fill={i % 2 ? c2 : c1} opacity={0.9} stroke="#ffffff" strokeWidth={0.5} />;
          })}
          <path className="cs-twinkle" style={{ ...origin(at([L + 10, top + 4], -100, 32)), ...delay(flip ? 1.2 : 0) }} d={star4(at([L + 10, top + 4], -100, 32), 3.5)} fill={glow} />
        </g>
      );
      const icicles = Array.from({ length: 9 }, (_, i) => L + 10 + i * ((g.w - 20) / 8));
      return {
        back: (
          <>
            {both(g, crystal)}
            {[
              [mid - 18, top - 30, 10],
              [mid + 26, top - 40, 6],
            ].map(([x, y, r], i) => (
              <g key={i} className="cs-spin-slow" style={{ ...origin([x!, y!]), ...delay(i * 0.6) }}>
                {flake([x!, y!], r!)}
              </g>
            ))}
            {[0, 1, 2].map((i) => <circle key={i} className="cs-snow" cx={L + g.w * (0.25 + i * 0.25)} cy={top - 48} r={1.4} fill={glow} style={delay(i * 1.5)} />)}
          </>
        ),
        // Frost along the top edge, icicles hanging off it.
        front: (
          <>
            <path d={`M${pt([L + 2, top + 1])} L${pt([R - 2, top + 1])}`} stroke={c1} strokeWidth={2.5} strokeLinecap="round" />
            {icicles.map((x, i) => (
              <path key={i} d={`M${f(x - 2.5)} ${top + 1} L${f(x)} ${top + 4 + (i % 3) * 1.5} L${f(x + 2.5)} ${top + 1} Z`} fill={c1} />
            ))}
          </>
        ),
      };
    }
  }
}

/**
 * The crest, measured to the HP box it wraps: `back` goes behind the box
 * (and up behind the name), `front` over its border. Put it inside a
 * positioned wrapper around the HP box.
 */
export function Crest({ spec, layer }: { spec: CrestSpec; layer: "back" | "front" }) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const measure = () => setSize((s) => (s && s.w === host.clientWidth && s.h === host.clientHeight ? s : { w: host.clientWidth, h: host.clientHeight }));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  const w = (size?.w ?? 0) + PAD.l + PAD.r;
  const h = (size?.h ?? 0) + PAD.t + PAD.b;
  const parts = size && size.w > 40 ? drawCrest(spec, { x: PAD.l, y: PAD.t, w: size.w, h: size.h }) : undefined;
  return (
    <svg
      ref={ref}
      className={`crest crest-${layer} crest-${spec.motif}${spec.variant ? ` crest-${spec.variant}` : ""}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ left: -PAD.l, top: -PAD.t, ["--crest-glow" as string]: spec.glow }}
      aria-hidden="true"
      focusable="false"
    >
      {parts?.[layer]}
    </svg>
  );
}

/** A small mark of the crest after the character's name. */
export function CrestSigil({ spec }: { spec: CrestSpec }) {
  const { c1, c2, glow } = spec;
  const c: Pt = [9, 9];
  const shape: Record<Motif, ReactNode> = {
    wings: <path d={`${blade([9, 15], -60, 13, 6, 6)} ${blade([9, 15], -120, 13, 6, -6)}`} fill={c1} stroke={c2} strokeWidth={0.6} />,
    horns: <path d="M5 16 C2 10 4 3 10 3 C13 3 14 6 12 7 C11 5 8 5 7 8 C6 11 8 14 9 16 Z" fill={c1} stroke={c2} strokeWidth={0.6} />,
    vines: <path d={blade([4, 15], -45, 14, 7)} fill={c1} stroke={c2} strokeWidth={0.6} />,
    laurel: <path d={`${blade([9, 16], -70, 7, 3)} ${blade([9, 12], -60, 6, 3)} ${blade([9, 16], -110, 7, 3)} ${blade([9, 12], -120, 6, 3)} ${blade([9, 9], -90, 6, 3)}`} fill={c1} />,
    stars: <path d={star4(c, 7)} fill={glow} stroke={c2} strokeWidth={0.5} />,
    web: <path d="M9 2 L9 16 M2 9 L16 9 M4 4 L14 14 M14 4 L4 14 M9 5 L13 9 L9 13 L5 9 Z" stroke={c1} strokeWidth={0.8} fill="none" />,
    runes: <path d="M7 3 L7 15 M7 3 L12 7 L7 11" stroke={glow} strokeWidth={1.6} fill="none" strokeLinecap="round" />,
    peaks: <path d="M1 15 L6 6 L9 10 L12 4 L17 15 Z" fill={c1} stroke={c2} strokeWidth={0.8} />,
    gears: <path d={gear(9, 9, 6, 8)} fill={c1} fillRule="evenodd" />,
    crystals: <path d="M6 16 L4 7 L8 2 L10 8 Z M10 16 L11 6 L15 9 L13 16 Z" fill={c1} stroke={glow} strokeWidth={0.5} />,
    flames: <path d="M9 16 C4 15 4 10 7 6 C7 9 9 9 9 6 C9 4 10 2 11 2 C11 6 15 8 14 12 C13 15 11 16 9 16 Z" fill={c1} stroke={c2} strokeWidth={0.6} />,
    sun: (
      <g>
        <circle cx={9} cy={9} r={4} fill={c1} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <path key={a} d={`M${pt(at(c, a, 5.5))} L${pt(at(c, a, 8))}`} stroke={c2} strokeWidth={1.2} strokeLinecap="round" />
        ))}
      </g>
    ),
    waves: <path d="M1 11 Q4 5 8 9 Q11 12 13 7 Q15 4 17 7 M1 15 Q5 11 9 14 Q13 16 17 12" stroke={c1} strokeWidth={1.6} fill="none" strokeLinecap="round" />,
    wind: <path d="M2 7 L12 7 Q16 7 15 4 Q14 2 12 3 M2 11 L14 11 Q17 11 16 14 Q15 16 13 15" stroke={c1} strokeWidth={1.4} fill="none" strokeLinecap="round" />,
    shards: <path d="M4 12 L7 3 L10 10 Z M10 15 L13 7 L16 13 Z" fill={c1} stroke={glow} strokeWidth={0.5} />,
    tusks: <path d="M5 16 Q3 8 9 3 Q6 9 8 16 Z M13 16 Q15 8 9 3 Q12 9 10 16 Z" fill={c1} />,
    spikes: <path d="M2 15 L5 5 L8 15 Z M7 15 L10 2 L13 15 Z M12 15 L15 6 L17 15 Z" fill={c1} />,
    serpent: <path d="M3 15 Q1 10 6 9 Q11 8 9 5 Q8 3 12 3 Q16 3 15 6" stroke={c1} strokeWidth={2.4} fill="none" strokeLinecap="round" />,
    tail: (
      <g fill={c1}>
        <ellipse cx={9} cy={12} rx={3.5} ry={3} />
        <circle cx={4.5} cy={7.5} r={1.7} />
        <circle cx={7.5} cy={5} r={1.7} />
        <circle cx={11} cy={5} r={1.7} />
        <circle cx={14} cy={7.5} r={1.7} />
      </g>
    ),
    clover: (
      <g fill={c1}>
        {[0, 90, 180, 270].map((a) => (
          <circle key={a} cx={at(c, a + 45, 3.6)[0]} cy={at(c, a + 45, 3.6)[1]} r={3} />
        ))}
        <path d="M9 9 Q11 14 9 17" stroke={c2} strokeWidth={1.2} fill="none" />
      </g>
    ),
    thorns: (
      <g>
        <ellipse cx={9} cy={9} rx={7} ry={4} fill={c2} />
        <circle cx={9} cy={9} r={2.2} fill={glow} />
      </g>
    ),
    wisps: <path d="M3 3 L15 15 M15 3 L3 15 M9 1 L9 17" stroke={c1} strokeWidth={1.2} strokeLinecap="round" />,
    frost: (
      <g stroke={c1} strokeWidth={1.1} strokeLinecap="round">
        {[0, 60, 120].map((a) => (
          <path key={a} d={`M${pt(at(c, a, 7))} L${pt(at(c, a + 180, 7))}`} />
        ))}
      </g>
    ),
  };
  return (
    <svg className={`crest-sigil crest-sigil-${spec.motif}`} width={18} height={18} viewBox="0 0 18 18" aria-hidden="true" focusable="false" style={{ ["--crest-glow" as string]: glow }}>
      <title>{spec.label}</title>
      {shape[spec.motif]}
    </svg>
  );
}
