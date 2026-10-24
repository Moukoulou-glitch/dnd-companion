import { DAMAGE_FX, damageKey } from "./looks";

/**
 * Generated spell effects (12a): every spell without a hand-made look of its own
 * (fx/spells.ts) gets one built from what the content already says about it:
 * its level, school, damage type, area and range. Nothing here is a rule and
 * nothing reads the spell's text for rules: the text is only searched for an
 * area's shape ("15-foot cone") when the spell has no `area`, and only to pick
 * a look. A spell from a book file gets one too, from the same fields.
 *
 * The higher the spell's level, the bigger the effect:
 *
 * - tier 0, cantrips:      small, where you tapped, under a second.
 * - tier 1, 1st–2nd:       a circle and its shape, about a second, a short name label.
 * - tier 2, 3rd–5th:       much of the screen, a coloured edge, about 1.5 s.
 * - tier 3, 6th–8th:       the whole screen dims, light rays, the name as a title, 2 s;
 *                          7th and 8th shake the screen a little.
 * - tier 4, 9th:           a full-screen moment up to 3 s: a sigil the width of the
 *                          screen built ring by ring, pillars of light, a flash, a
 *                          stronger shake and buzz. A tap ends it early.
 *
 * Cast with a higher slot: more rings and sparks, never a higher tier.
 * Reduced motion: a still sigil and the name, fading (styles.css), no shake.
 */

export type GenShape = "cone" | "line" | "sphere" | "cube" | "cylinder" | "wall" | "touch" | "ray" | "aura" | "heal" | "motif";
export type Tier = 0 | 1 | 2 | 3 | 4;
export type School = "abjuration" | "conjuration" | "divination" | "enchantment" | "evocation" | "illusion" | "necromancy" | "transmutation" | "arcane";

/** What a spell's content says, as far as its look goes. */
export interface SpellInfo {
  id: string;
  name: string;
  level: number;
  school: string;
  range?: string;
  area?: string;
  text?: string[];
  attack?: "melee" | "ranged";
  save?: unknown;
  damage?: { type?: string; typeOptions?: string[] };
  heal?: unknown;
  singleTarget?: boolean;
}

/** One generated phase, carried in the event: everything the drawing needs. */
export interface GenLook {
  spell: string;
  name: string;
  phase: "cast" | "resolve" | "again";
  tier: Tier;
  level: number;
  /** Slot levels above the spell's own (cast only). */
  up: number;
  school: School;
  shape: GenShape;
  /** Colours (r, g, b): the damage type's or the school's, and the school's second colour. */
  rgb: string;
  rgb2: string;
  /** The damage type's name, shown with its impact. */
  damage?: string;
  ms: number;
  at: "tap" | "hp" | "center";
  buzz: number[];
  particles: number;
  rings: number;
  /** Screen shake, in ms (7th level and up); 0 for none. */
  shake: number;
  /** Long enough that a tap ends it early. */
  skippable: boolean;
  /** Shown with it: the spell's name (1st level and up). */
  label?: string;
}

export const SCHOOL_COLOURS: Record<School, { rgb: string; rgb2: string }> = {
  abjuration: { rgb: "170, 215, 255", rgb2: "235, 245, 255" },
  conjuration: { rgb: "120, 230, 220", rgb2: "200, 160, 255" },
  divination: { rgb: "255, 228, 150", rgb2: "180, 220, 255" },
  enchantment: { rgb: "255, 140, 210", rgb2: "200, 150, 255" },
  evocation: { rgb: "255, 150, 90", rgb2: "255, 230, 140" },
  illusion: { rgb: "190, 150, 255", rgb2: "140, 240, 255" },
  necromancy: { rgb: "140, 230, 150", rgb2: "120, 60, 150" },
  transmutation: { rgb: "255, 200, 110", rgb2: "140, 230, 160" },
  arcane: { rgb: "150, 140, 255", rgb2: "220, 210, 255" },
};
const HEAL = { rgb: "110, 230, 160", rgb2: "240, 200, 90" };

export const schoolOf = (s: string | undefined): School => {
  const k = (s ?? "").trim().toLowerCase() as School;
  return k in SCHOOL_COLOURS ? k : "arcane";
};

export const tierOf = (level: number): Tier => (level <= 0 ? 0 : level <= 2 ? 1 : level <= 5 ? 2 : level <= 8 ? 3 : 4);

/** How long each tier's cast and impact stay on screen (ms). */
export const CAST_MS: Record<Tier, number> = { 0: 700, 1: 1000, 2: 1400, 3: 2000, 4: 2800 };
export const IMPACT_MS: Record<Tier, number> = { 0: 450, 1: 600, 2: 800, 3: 1000, 4: 1300 };
const BUZZ: Record<Tier, number[]> = {
  0: [12],
  1: [18, 30, 18],
  2: [30, 40, 30, 40, 40],
  3: [50, 40, 50, 40, 90],
  4: [70, 50, 70, 50, 110, 60, 220],
};
const PARTS: Record<Tier, number> = { 0: 6, 1: 10, 2: 14, 3: 20, 4: 26 };
/** A tap ends anything longer than this. */
export const SKIP_AFTER = 1500;

/** Shake by the spell's level: none below 7th. */
export const shakeOf = (level: number, phase: GenLook["phase"]): number => {
  if (level < 7) return 0;
  const ms = level >= 9 ? 650 : level === 8 ? 380 : 300;
  return phase === "cast" ? ms : Math.round(ms * 0.6);
};

/**
 * The look's shape: healing first, then the area (its own field, or the first
 * "N-foot shape" in the text; a smite or a single target's damage first), then touch, a ranged attack or single target, a
 * spell on yourself, and otherwise the school's own motif.
 */
export function shapeOf(s: SpellInfo): GenShape {
  if (s.heal) return "heal";
  const area = (s.area ?? (s.text ?? []).join(" ").match(/\d+-foot[- ](radius|cone|cube|line|cylinder|sphere|square|emanation)/i)?.[1] ?? "").toLowerCase();
  if (/wall/i.test(s.name)) return "wall";
  // A smite rides on your weapon's strike.
  if (/smite/i.test(s.name)) return "touch";
  // One target and no area of its own (an area named only in its text is something else it does): a ray.
  if (s.damage && s.singleTarget && !s.area && (s.range ?? "").trim().toLowerCase() !== "touch") return "ray";
  if (/cone/.test(area)) return "cone";
  if (/line/.test(area)) return "line";
  if (/cylinder/.test(area)) return "cylinder";
  if (/cube|square/.test(area)) return "cube";
  if (/sphere|radius|emanation/.test(area)) return s.damage ? "sphere" : /^self/i.test(s.range ?? "") ? "aura" : "sphere";
  const range = (s.range ?? "").trim().toLowerCase();
  if (range === "touch") return "touch";
  if (s.damage && (s.attack === "ranged" || /\d+\s*(feet|foot|ft)/.test(range))) return "ray";
  if (range.startsWith("self")) return "aura";
  return "motif";
}

/** The damage type the look takes its colour from: the spell's own, or the first it lets you pick. */
const damageOf = (s: SpellInfo): string | undefined => damageKey(s.damage?.type) ?? damageKey(s.damage?.typeOptions?.[0]);

/**
 * A spell's generated phase. `slot`: the level it was cast at (for more rings
 * and sparks when it's higher than the spell's own). `type`: the damage type
 * actually rolled, when known (it then colours the impact).
 */
export function genLook(s: SpellInfo, phase: GenLook["phase"], opts: { slot?: number; type?: string } = {}): GenLook {
  const level = Math.max(0, Math.min(9, Math.round(s.level || 0)));
  const tier = tierOf(level);
  const school = schoolOf(s.school);
  const shape = shapeOf(s);
  const dmg = (opts.type && damageKey(opts.type)) || damageOf(s);
  const base = shape === "heal" ? HEAL : SCHOOL_COLOURS[school];
  const rgb = dmg ? DAMAGE_FX[dmg]!.rgb : base.rgb;
  const up = phase === "cast" && opts.slot && opts.slot > level && level > 0 ? Math.min(3, opts.slot - level) : 0;
  const cast = phase === "cast";
  const ms = cast ? CAST_MS[tier] : IMPACT_MS[tier];
  return {
    spell: s.id,
    name: s.name,
    phase,
    tier,
    level,
    up,
    school,
    shape,
    rgb,
    rgb2: base.rgb2,
    ...(dmg ? { damage: DAMAGE_FX[dmg]!.label } : {}),
    ms,
    // Big ones take the middle of the screen; a spell on yourself plays on your hit points; the rest where you tapped.
    at: tier >= 3 ? "center" : shape === "aura" || (shape === "heal" && /^self/i.test(s.range ?? "")) ? "hp" : "tap",
    buzz: cast ? BUZZ[tier] : BUZZ[Math.max(0, tier - 1) as Tier],
    particles: Math.min(32, (cast ? PARTS[tier] : Math.round(PARTS[tier] * 0.7)) + up * 2),
    rings: Math.min(6, 1 + tier + up),
    shake: shakeOf(level, phase),
    skippable: ms > SKIP_AFTER,
    ...(level > 0 && cast ? { label: up ? `${s.name} · ${ordinal(opts.slot!)} level` : s.name } : !cast && dmg ? { label: DAMAGE_FX[dmg]!.label } : {}),
  };
}

const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** A content spell (SpellDef, from the SRD or a book file) → what its look needs. */
export function spellInfoOf(d: unknown): SpellInfo | undefined {
  const x = d as Partial<SpellInfo> & { kind?: string };
  if (!x || typeof x.id !== "string" || typeof x.level !== "number") return undefined;
  return {
    id: x.id,
    name: typeof x.name === "string" ? x.name : x.id.replace(/^spell:/, ""),
    level: x.level,
    school: typeof x.school === "string" ? x.school : "",
    ...(x.range ? { range: x.range } : {}),
    ...(x.area ? { area: x.area } : {}),
    ...(Array.isArray(x.text) ? { text: x.text } : {}),
    ...(x.attack ? { attack: x.attack } : {}),
    ...(x.save ? { save: x.save } : {}),
    ...(x.damage ? { damage: x.damage } : {}),
    ...(x.heal ? { heal: x.heal } : {}),
    ...(x.singleTarget ? { singleTarget: true } : {}),
  };
}
