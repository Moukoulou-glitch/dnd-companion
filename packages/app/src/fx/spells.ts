import { CHARM_SPELLS } from "./looks";
/**
 * Spell effects by phase, keyed by the spell's content id (never its name).
 * Animation only: nothing here knows or changes how a spell works. Each phase
 * plays from its own confirmed event:
 *
 * - cast:    the castSpell operation is recorded.
 * - again:   a later use while the spell lasts: its damage rolled from the
 *            concentration chip (Call Lightning's next bolt, Moonbeam's next burn).
 * - resolve: its damage rolled right after casting (from the spell itself).
 * - ongoing: a quiet loop shown while the engine says you're concentrating on
 *            it; gone (with a short fade) the moment concentration ends.
 *
 * A phase left out plays nothing (or, for cast, the generic arcane circle), so
 * a lasting spell never replays its whole cast every turn.
 */
export type SpellPhase = "cast" | "again" | "resolve";

/** The look of a phase, taking the picked mode into account (no mode, or an unknown one: the neutral look). */
export function phaseLook(spell: string, phase: SpellPhase, mode?: string): PhaseLook | undefined {
  const d = SPELL_FX[spell];
  if (!d) return undefined;
  if (phase === "cast" && mode) return d.modes?.[mode.toLowerCase()]?.cast ?? d.cast;
  return d[phase];
}

export interface PhaseLook {
  /** CSS class with the look (styles.css, "Spell effects"). */
  look: string;
  ms: number;
  /** Where: where you tapped, the top of the screen down to the tap, across the whole width, or up from the ground (the bottom) to the tap. */
  at: "tap" | "sky" | "across" | "edge" | "ground";
  /** navigator.vibrate pattern, when the phone has it. */
  buzz?: number[];
  /** Flying pieces (thorns, grit). */
  particles?: number;
}

export interface SpellFxDef {
  family: "moonlight" | "lightning" | "wind" | "water" | "ice" | "weather" | "charm" | "nature";
  cast?: PhaseLook;
  again?: PhaseLook;
  resolve?: PhaseLook;
  /** CSS class of the quiet loop while concentrating; static under reduced motion, paused when the app is in the background. */
  ongoing?: string;
  /**
   * Looks by the mode the player picked when casting (the spell's effect
   * choice, lower case: "flood", "rain"). No mode picked, or one not listed:
   * the neutral cast and ongoing above, never a guess.
   */
  modes?: Record<string, { cast?: PhaseLook; ongoing?: string }>;
}

const moonPulse: PhaseLook = { look: "sfx-moon-pulse", ms: 450, at: "tap" };

export const SPELL_FX: Record<string, SpellFxDef> = {
  "spell:moonbeam": {
    family: "moonlight",
    // A silver-blue glyph, then the column of moonlight comes down.
    cast: { look: "sfx-moon-cast", ms: 900, at: "sky" },
    again: moonPulse,
    resolve: moonPulse,
    ongoing: "sfx-ongoing-moon",
  },
  "spell:call-lightning": {
    family: "lightning",
    // The storm gathers once; every later bolt comes from it, short.
    cast: { look: "sfx-storm-cast", ms: 1100, at: "sky", buzz: [50] },
    again: { look: "sfx-bolt", ms: 420, at: "sky", buzz: [35] },
    ongoing: "sfx-ongoing-storm",
  },
  "spell:gust-of-wind": {
    family: "wind",
    cast: { look: "sfx-gust", ms: 800, at: "across" },
    ongoing: "sfx-ongoing-wind",
  },
};

const water = (look: string): PhaseLook => ({ look: `sfx-water ${look}`, ms: 900, at: "across" });
const weather = (look: string): PhaseLook => ({ look: `sfx-weather ${look}`, ms: 1400, at: "edge" });

Object.assign(SPELL_FX, {
  "spell:ice-storm": {
    family: "ice",
    // Frost at the edges, hail coming down, then one wide icy wave. Its damage roll doesn't replay it.
    cast: { look: "sfx-ice", ms: 900, at: "sky", buzz: [25, 40, 25] },
  },
  "spell:control-water": {
    family: "water",
    cast: water("sfx-water-neutral"),
    ongoing: "sfx-ongoing-water",
    modes: {
      flood: { cast: water("sfx-water-flood") },
      "part water": { cast: water("sfx-water-part") },
      "redirect flow": { cast: water("sfx-water-redirect") },
      whirlpool: { cast: { look: "sfx-water sfx-water-whirl", ms: 900, at: "tap" } },
    },
  },
  "spell:control-weather": {
    family: "weather",
    // Slower: layers of cloud and light settle in. The ongoing loop is only a faint sky at the top: the weather changes in stages, not at once.
    cast: weather("sfx-weather-neutral"),
    ongoing: "sfx-ongoing-weather",
    modes: {
      "clear skies": { cast: weather("sfx-weather-clear"), ongoing: "sfx-ongoing-weather sfx-ongoing-clear" },
      rain: { cast: weather("sfx-weather-rain"), ongoing: "sfx-ongoing-weather sfx-ongoing-rain" },
      snow: { cast: weather("sfx-weather-snow"), ongoing: "sfx-ongoing-weather sfx-ongoing-snow" },
      wind: { cast: weather("sfx-weather-wind"), ongoing: "sfx-ongoing-weather sfx-ongoing-windy" },
      storm: { cast: weather("sfx-weather-storm"), ongoing: "sfx-ongoing-weather sfx-ongoing-storm" },
    },
  },
} satisfies Record<string, SpellFxDef>);

// Spells that charm (fx/looks.ts CHARM_SPELLS): a rose-violet spiral drawing in where you tapped; while you
// concentrate on one (Dominate Person, Hypnotic Pattern), a faint rose shimmer at the bottom edge.
for (const id of CHARM_SPELLS) SPELL_FX[id] = { family: "charm", cast: { look: "sfx-charm", ms: 900, at: "tap" }, ongoing: "sfx-ongoing-charm" };

// Nature: plants and earth growing up from the ground (the bottom of the screen) toward where you tapped.
const ground = (look: string, ms = 900, buzz?: number[]): PhaseLook => ({ look: `sfx-nature ${look}`, ms, at: "ground", ...(buzz ? { buzz } : {}) });
const thornHit: PhaseLook = { look: "sfx-thorn-hit", ms: 380, at: "tap", particles: 6 };
const crush: PhaseLook = { look: "sfx-crush", ms: 450, at: "tap", buzz: [30, 30], particles: 5 };
Object.assign(SPELL_FX, {
  // A thorny vine whips up and lashes; its damage, a sting of thorns.
  "spell:thorn-whip": { family: "nature", cast: ground("sfx-whip", 600), resolve: thornHit },
  // Weeds and vines spring up and twist; a low tangle at the bottom while it lasts.
  "spell:entangle": { family: "nature", cast: ground("sfx-vines"), ongoing: "sfx-ongoing-vines" },
  // The ground hardens into spikes; a creature's damage from them (from the chip) is a sting of thorns.
  "spell:spike-growth": { family: "nature", cast: ground("sfx-spikes", 800), again: thornHit, resolve: thornHit, ongoing: "sfx-ongoing-spikes" },
  // One thick vine rises with a curling tip, and stays curled at the edge while it lasts.
  "spell:grasping-vine": { family: "nature", cast: ground("sfx-vines sfx-vine-one"), ongoing: "sfx-ongoing-vine" },
  // The earth cracks, a hand of earth rises and closes; each crush (right after casting or later from the chip) squeezes.
  "spell:maximilians-earthen-grasp": { family: "nature", cast: ground("sfx-grasp", 950, [40]), resolve: crush, again: crush, ongoing: "sfx-ongoing-earth" },
} satisfies Record<string, SpellFxDef>);

// Plant Growth: in a moment (Overgrowth), plants burst up and spread wide with leaves flying;
// over 8 hours (Enrichment), slow sprouts and a warm glow over the land. It doesn't last, so no loop.
Object.assign(SPELL_FX, {
  "spell:plant-growth": {
    family: "nature",
    cast: ground("sfx-vines sfx-overgrowth", 1300, [20, 30, 20]),
    modes: { "8 hours": { cast: ground("sfx-enrich", 1700) } },
  },
  // A wall of tangled brambles rises across the ground; a creature's damage from it is a sting of thorns.
  "spell:wall-of-thorns": { family: "nature", cast: ground("sfx-thorn-wall", 1100, [30, 40, 30]), again: thornHit, resolve: thornHit, ongoing: "sfx-ongoing-thorns" },
} satisfies Record<string, SpellFxDef>);

// Shocking Grasp: lightning crackles over your hand where you touch (its damage then plays the lightning look).
SPELL_FX["spell:shocking-grasp"] = { family: "lightning", cast: { look: "sfx-shock", ms: 600, at: "tap", buzz: [15, 25, 15], particles: 6 } };

// Spell accents on their damage (7c), built from the looks above; the dice themselves take the damage type's theme.
Object.assign(SPELL_FX, {
  // Fireball: an expanding ember burst where you tapped, a controlled explosion.
  "spell:fireball": { family: "nature", resolve: { look: "sfx-fireball", ms: 900, at: "tap", buzz: [40, 30, 20], particles: 10 } },
  // Lightning Bolt: a bright arc straight across, brief.
  "spell:lightning-bolt": { family: "lightning", resolve: { look: "sfx-lbolt", ms: 520, at: "across", buzz: [15, 25, 15] } },
  // Tidal Wave: the water's flood, washing across.
  "spell:tidal-wave": { family: "water", cast: water("sfx-water-flood"), resolve: water("sfx-water-flood") },
} satisfies Record<string, SpellFxDef>);

export const spellFxOf = (spell: string | undefined): SpellFxDef | undefined => (spell ? SPELL_FX[spell] : undefined);
